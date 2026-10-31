resource "aws_sns_topic" "alerts" { name = "${local.name}-alerts" }
resource "aws_sns_topic_subscription" "alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_cloudwatch_log_group" "app" {
  name              = "/${local.name}/app"
  retention_in_days = 7
}
resource "aws_cloudwatch_log_group" "operations" {
  name              = "/${local.name}/operations"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  name           = "${local.name}-app-errors"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level >= 50 }"
  metric_transformation {
    name          = "AppErrors"
    namespace     = local.namespace
    value         = "1"
    default_value = 0
  }
}
resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole", Condition = { StringEquals = { "aws:SourceAccount" = var.aws_account_id } } }] })
}
resource "aws_iam_role_policy" "scheduler" {
  role   = aws_iam_role.scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.service["monitor"].arn }] })
}
resource "aws_scheduler_schedule" "monitor" {
  for_each            = { health = "rate(5 minutes)", backup = "rate(6 hours)" }
  name                = "${local.name}-${each.key}"
  schedule_expression = each.value
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.service["monitor"].arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ kind = each.key })
    retry_policy {
      maximum_event_age_in_seconds = 300
      maximum_retry_attempts       = 2
    }
  }
  depends_on = [aws_iam_role_policy.scheduler]
}
locals {
  alarm_specs = {
    instance    = { namespace = "AWS/EC2", metric = "StatusCheckFailed", dimensions = { InstanceId = var.ec2_instance_id }, statistic = "Maximum", threshold = 1, comparison = "GreaterThanOrEqualToThreshold", period = 300, missing = "missing" }
    disk        = { namespace = local.namespace, metric = "disk_used_percent", dimensions = { InstanceId = var.ec2_instance_id }, statistic = "Maximum", threshold = 85, comparison = "GreaterThanThreshold", period = 300, missing = "breaching" }
    health      = { namespace = local.namespace, metric = "PublicAvailability", dimensions = {}, statistic = "Minimum", threshold = 1, comparison = "LessThanThreshold", period = 300, missing = "breaching" }
    backups     = { namespace = local.namespace, metric = "BackupAgeSeconds", dimensions = {}, statistic = "Maximum", threshold = 129600, comparison = "GreaterThanThreshold", period = 21600, missing = "breaching" }
    dlq         = { namespace = "AWS/SQS", metric = "ApproximateNumberOfMessagesVisible", dimensions = { QueueName = aws_sqs_queue.mail_dlq.name }, statistic = "Maximum", threshold = 0, comparison = "GreaterThanThreshold", period = 300, missing = "notBreaching" }
    backlog     = { namespace = "AWS/SQS", metric = "ApproximateAgeOfOldestMessage", dimensions = { QueueName = aws_sqs_queue.mail.name }, statistic = "Maximum", threshold = 120, comparison = "GreaterThanThreshold", period = 300, missing = "notBreaching" }
    worker      = { namespace = "AWS/Lambda", metric = "Errors", dimensions = { FunctionName = aws_lambda_function.service["worker"].function_name }, statistic = "Sum", threshold = 0, comparison = "GreaterThanThreshold", period = 300, missing = "notBreaching" }
    application = { namespace = local.namespace, metric = "AppErrors", dimensions = {}, statistic = "Sum", threshold = 5, comparison = "GreaterThanThreshold", period = 300, missing = "notBreaching" }
  }
}
resource "aws_cloudwatch_metric_alarm" "service" {
  for_each            = local.alarm_specs
  alarm_name          = "${local.name}-${each.key}"
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  dimensions          = each.value.dimensions
  statistic           = each.value.statistic
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison
  period              = each.value.period
  evaluation_periods  = 2
  treat_missing_data  = each.value.missing
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
resource "aws_cloudwatch_dashboard" "service" {
  dashboard_name = local.name
  dashboard_body = jsonencode({ widgets = [for index, spec in [
    { title = "Host", metrics = [["AWS/EC2", "CPUUtilization", "InstanceId", var.ec2_instance_id], [local.namespace, "mem_used_percent", "InstanceId", var.ec2_instance_id], [local.namespace, "disk_used_percent", "InstanceId", var.ec2_instance_id]] },
    { title = "Availability and app errors", metrics = [[local.namespace, "PublicAvailability"], [local.namespace, "AppErrors"]] },
    { title = "Backups", metrics = [[local.namespace, "BackupAgeSeconds"]] },
    { title = "Email backlog", metrics = [["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.mail.name], ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.mail_dlq.name]] }
  ] : { type = "metric", x = (index % 2) * 12, y = floor(index / 2) * 6, width = 12, height = 6, properties = { title = spec.title, metrics = spec.metrics, region = var.aws_region, period = 300, stat = "Average", view = "timeSeries" } }] })
}
resource "aws_budgets_budget" "addons" {
  name         = "${local.name}-addons"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_addon_budget)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  # These product names are AWS Cost Explorer SERVICE values. S3/CloudWatch
  # totals include existing account usage; this intentionally errs conservatively.
  cost_filter {
    name   = "Service"
    values = ["Amazon Simple Storage Service", "Amazon Simple Queue Service", "AWS Lambda", "Amazon Cognito", "AWS Key Management Service", "Amazon Simple Email Service", "AmazonCloudWatch", "Amazon DynamoDB", "Amazon Simple Notification Service", "Amazon EventBridge"]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_budgets_budget" "account" {
  name         = "${local.name}-account-total"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_account_budget)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
