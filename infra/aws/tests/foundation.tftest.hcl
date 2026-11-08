mock_provider "aws" {
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
}

variables {
  aws_account_id  = "123456789012"
  ec2_instance_id = "i-0123456789abcdef0"
  ec2_role_name   = "existing-role"
  app_origin      = "https://app.example.com"
  email_domain    = "example.com"
  email_from      = "no-reply@example.com"
  alert_email     = "owner@example.com"
}

run "portfolio_plan" {
  command = plan
  assert {
    condition     = length(aws_s3_bucket.canvas_documents) == 0
    error_message = "Canvas document storage must be opt-in to avoid silently changing existing storage."
  }
  assert {
    condition     = aws_s3_bucket.backups.force_destroy == false && aws_s3_bucket_public_access_block.backups.block_public_policy
    error_message = "Backups must remain private and protected from force deletion."
  }
  assert {
    condition     = aws_sqs_queue.mail.visibility_timeout_seconds >= 6 * aws_lambda_function.service["worker"].timeout
    error_message = "SQS visibility must cover Lambda retries."
  }
  assert {
    condition     = aws_cognito_user_pool_client.web.generate_secret == false && aws_cognito_user_pool_client.web.allowed_oauth_flows == toset(["code"])
    error_message = "Use authorization code + PKCE with no browser client secret."
  }
  assert {
    condition     = aws_cognito_user_pool.users.user_pool_tier == "LITE" && length(aws_cloudwatch_metric_alarm.service) <= 10
    error_message = "Keep the low-cost Cognito tier and alarm count."
  }
}

run "canvas_bucket_opt_in" {
  command = plan
  variables { enable_canvas_object_bucket = true }
  assert {
    condition     = length(aws_s3_bucket.canvas_documents) == 1 && !aws_s3_bucket.canvas_documents[0].force_destroy && aws_s3_bucket_public_access_block.canvas_documents[0].block_public_policy
    error_message = "Canvas documents must have a private bucket protected from force deletion."
  }
  assert {
    condition     = aws_ssm_parameter.canvas_documents[0].name == "/meshwork-prod/runtime/CANVAS_S3_BUCKET"
    error_message = "The canvas bucket must be exposed in the runtime configuration."
  }
}

run "reject_plain_http" {
  command = plan
  variables { app_origin = "http://app.example.com" }
  expect_failures = [var.app_origin]
}
