resource "aws_iam_role_policy_attachment" "ssm" {
  role       = var.ec2_role_name
  policy_arn = "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "ec2" {
  name = "${local.name}-operations"
  role = var.ec2_role_name
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject", "s3:AbortMultipartUpload"], Resource = "${aws_s3_bucket.backups.arn}/${local.backup_prefix}*" },
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.architecture_plans.arn, Condition = { StringLike = { "s3:prefix" = "projects/*" } } },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.architecture_plans.arn}/projects/*" },
    { Effect = "Allow", Action = ["dynamodb:Scan", "dynamodb:DescribeContinuousBackups"], Resource = "arn:${local.partition}:dynamodb:${var.aws_region}:${var.aws_account_id}:table/${var.canvas_table_name}" },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], Resource = ["${aws_cloudwatch_log_group.app.arn}:*", "${aws_cloudwatch_log_group.operations.arn}:*"] },
    { Effect = "Allow", Action = ["logs:CreateLogGroup"], Resource = [aws_cloudwatch_log_group.app.arn, aws_cloudwatch_log_group.operations.arn] },
    { Effect = "Allow", Action = ["logs:DescribeLogGroups"], Resource = "*" },
    { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*", Condition = { StringEquals = { "cloudwatch:namespace" = local.namespace } } },
    { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"], Resource = "arn:${local.partition}:ssm:${var.aws_region}:${var.aws_account_id}:parameter/${local.name}/*" }
  ] })
}
resource "aws_ssm_parameter" "runtime" {
  for_each = {
    BACKUP_S3_URI      = "s3://${aws_s3_bucket.backups.id}/${local.backup_prefix}"
    ARTIFACT_S3_BUCKET = aws_s3_bucket.architecture_plans.id
    COGNITO_DOMAIN     = "https://${aws_cognito_user_pool_domain.users.domain}.auth.${var.aws_region}.amazoncognito.com"
    COGNITO_CLIENT_ID  = aws_cognito_user_pool_client.web.id
    COGNITO_POOL_ID    = aws_cognito_user_pool.users.id
  }
  name  = "/${local.name}/runtime/${each.key}"
  type  = "String"
  value = each.value
  tier  = "Standard"
}
resource "aws_ssm_parameter" "agent" {
  name = "/${local.name}/cloudwatch-agent"
  type = "String"
  tier = "Standard"
  value = jsonencode({
    agent = { run_as_user = "root" }
    metrics = {
      namespace              = local.namespace
      append_dimensions      = { InstanceId = "$${aws:InstanceId}" }
      aggregation_dimensions = [["InstanceId"]]
      metrics_collected = {
        mem  = { measurement = ["mem_used_percent"], metrics_collection_interval = 60, drop_original_metrics = ["mem_used_percent"] }
        disk = { measurement = ["used_percent"], resources = ["/"], metrics_collection_interval = 60, drop_original_metrics = ["disk_used_percent"] }
      }
    }
    logs = { logs_collected = { files = { collect_list = [
      { file_path = "/home/ubuntu/.pm2/logs/meshwork-out.log", log_group_name = aws_cloudwatch_log_group.app.name, log_stream_name = "{instance_id}/node", timezone = "UTC" },
      { file_path = "/home/ubuntu/.pm2/logs/meshwork-error.log", log_group_name = aws_cloudwatch_log_group.app.name, log_stream_name = "{instance_id}/node-error", timezone = "UTC" },
      { file_path = "/home/ubuntu/.pm2/logs/meshwork-auth-out.log", log_group_name = aws_cloudwatch_log_group.app.name, log_stream_name = "{instance_id}/auth-out", timezone = "UTC" },
      { file_path = "/home/ubuntu/.pm2/logs/meshwork-auth-error.log", log_group_name = aws_cloudwatch_log_group.app.name, log_stream_name = "{instance_id}/auth-error", timezone = "UTC" },
      { file_path = "/var/log/nginx/error.log", log_group_name = aws_cloudwatch_log_group.operations.name, log_stream_name = "{instance_id}/nginx", timezone = "UTC" }
    ] } } }
  })
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.github_oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_iam_role" "deploy" {
  name = "${local.name}-github-deploy"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow"
    Principal = { Federated = var.github_oidc_provider_arn == null ? aws_iam_openid_connect_provider.github[0].arn : var.github_oidc_provider_arn }
    Action    = "sts:AssumeRoleWithWebIdentity"
    Condition = { StringEquals = {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${var.github_environment}"
    } }
  }] })
}
resource "aws_ssm_document" "deploy" {
  name          = "${local.name}-deploy"
  document_type = "Command"
  content = jsonencode({ schemaVersion = "2.2", description = "Run the fixed, root-reviewed deployment wrapper", mainSteps = [{
    action = "aws:runShellScript", name = "deploy", inputs = { timeoutSeconds = "900", runCommand = ["/usr/local/sbin/meshwork-deploy"] }
  }] })
}
resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.deploy.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = [aws_ssm_document.deploy.arn, "arn:${local.partition}:ec2:${var.aws_region}:${var.aws_account_id}:instance/${var.ec2_instance_id}"] },
    { Effect = "Allow", Action = ["ssm:GetCommandInvocation"], Resource = "*" }
  ] })
}
