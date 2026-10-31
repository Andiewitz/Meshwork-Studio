locals {
  function_names = toset(["intake", "worker", "monitor", "feedback"])
  lambda_trust   = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
data "archive_file" "lambda" {
  for_each    = local.function_names
  type        = "zip"
  source_file = "${path.module}/.build/${each.key}.cjs"
  output_path = "${path.module}/.build/${each.key}.zip"
}
resource "aws_iam_role" "lambda" {
  for_each           = local.function_names
  name               = "${local.name}-${each.key}"
  assume_role_policy = local.lambda_trust
}
resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.function_names
  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = 7
}
resource "aws_iam_role_policy" "lambda_logs" {
  for_each = local.function_names
  role     = aws_iam_role.lambda[each.key].id
  policy   = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.lambda[each.key].arn}:*" }] })
}
resource "aws_iam_role_policy" "intake" {
  role   = aws_iam_role.lambda["intake"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.mail.arn }] })
}
resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.lambda["worker"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.mail.arn },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"], Resource = aws_dynamodb_table.mail.arn },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = aws_kms_key.sender.arn, Condition = { StringEquals = { "kms:EncryptionContext:userpool-id" = aws_cognito_user_pool.users.id } } },
    { Effect = "Allow", Action = ["ses:SendEmail"], Resource = [aws_sesv2_email_identity.sender.arn, aws_sesv2_configuration_set.mail.arn], Condition = { StringEquals = { "ses:FromAddress" = var.email_from } } }
  ] })
}
resource "aws_iam_role_policy" "feedback" {
  role = aws_iam_role.lambda["feedback"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["dynamodb:PutItem"], Resource = aws_dynamodb_table.mail.arn,
    Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["suppress#*"] } }
  }] })
}
resource "aws_iam_role_policy" "monitor" {
  role = aws_iam_role.lambda["monitor"].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.backups.arn, Condition = { StringLike = { "s3:prefix" = ["${local.backup_prefix}*"] } } },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.backups.arn}/${local.backup_prefix}*" },
    { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*", Condition = { StringEquals = { "cloudwatch:namespace" = local.namespace } } }
  ] })
}
resource "aws_lambda_function" "intake" {
  function_name    = "${local.name}-intake"
  role             = aws_iam_role.lambda["intake"].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "intake.handler"
  filename         = data.archive_file.lambda["intake"].output_path
  source_code_hash = data.archive_file.lambda["intake"].output_base64sha256
  timeout          = 5
  memory_size      = 128
  environment { variables = { QUEUE_URL = aws_sqs_queue.mail.id } }
  depends_on = [aws_iam_role_policy.intake, aws_iam_role_policy.lambda_logs]
}
resource "aws_lambda_function" "service" {
  for_each         = toset(["worker", "monitor", "feedback"])
  function_name    = "${local.name}-${each.key}"
  role             = aws_iam_role.lambda[each.key].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "${each.key}.handler"
  filename         = data.archive_file.lambda[each.key].output_path
  source_code_hash = data.archive_file.lambda[each.key].output_base64sha256
  timeout          = each.key == "monitor" ? 60 : 30
  memory_size      = 256
  environment {
    variables = {
      POOL_ID               = aws_cognito_user_pool.users.id
      TABLE_NAME            = aws_dynamodb_table.mail.name
      KEY_ARN               = aws_kms_key.sender.arn
      EMAIL_FROM            = var.email_from
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.mail.configuration_set_name
      DAILY_EMAIL_LIMIT     = tostring(var.daily_email_limit)
      FEEDBACK_TOPIC_ARN    = aws_sns_topic.feedback.arn
      BACKUP_BUCKET         = aws_s3_bucket.backups.id
      BACKUP_PREFIX         = local.backup_prefix
      HEALTH_URL            = "${var.app_origin}/ready"
      METRIC_NAMESPACE      = local.namespace
    }
  }
  depends_on = [aws_iam_role_policy.worker, aws_iam_role_policy.monitor, aws_iam_role_policy.feedback, aws_iam_role_policy.lambda_logs]
}
resource "aws_lambda_event_source_mapping" "mail" {
  event_source_arn        = aws_sqs_queue.mail.arn
  function_name           = aws_lambda_function.service["worker"].arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config { maximum_concurrency = 2 }
}
resource "aws_lambda_permission" "feedback" {
  statement_id   = "SESEmailFeedback"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.service["feedback"].function_name
  principal      = "sns.amazonaws.com"
  source_arn     = aws_sns_topic.feedback.arn
  source_account = var.aws_account_id
}
resource "aws_sns_topic_subscription" "feedback" {
  topic_arn  = aws_sns_topic.feedback.arn
  protocol   = "lambda"
  endpoint   = aws_lambda_function.service["feedback"].arn
  depends_on = [aws_lambda_permission.feedback]
}
