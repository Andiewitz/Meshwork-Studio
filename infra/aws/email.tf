resource "aws_sqs_queue" "mail_dlq" {
  name                      = "${local.name}-mail-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "mail" {
  name                       = "${local.name}-mail"
  message_retention_seconds  = 86400
  visibility_timeout_seconds = 180
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.mail_dlq.arn, maxReceiveCount = 5 })
}
resource "aws_sqs_queue_redrive_allow_policy" "mail" {
  queue_url            = aws_sqs_queue.mail_dlq.id
  redrive_allow_policy = jsonencode({ redrivePermission = "byQueue", sourceQueueArns = [aws_sqs_queue.mail.arn] })
}
resource "aws_kms_key" "sender" {
  description             = "Cognito custom email codes (one billable customer-managed key)"
  deletion_window_in_days = 30
  # Rotation increases monthly key-material charges; opt in deliberately later.
  enable_key_rotation = false
}
resource "aws_kms_alias" "sender" {
  name          = "alias/${local.name}-cognito-email"
  target_key_id = aws_kms_key.sender.key_id
}
resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.email_domain
}
resource "aws_sesv2_configuration_set" "mail" {
  configuration_set_name = "${local.name}-mail"
}
resource "aws_sns_topic" "feedback" { name = "${local.name}-email-feedback" }
resource "aws_sns_topic_policy" "feedback" {
  arn = aws_sns_topic.feedback.arn
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Allow", Principal = { Service = "ses.amazonaws.com" }, Action = "SNS:Publish", Resource = aws_sns_topic.feedback.arn
    Condition = { StringEquals = { "AWS:SourceAccount" = var.aws_account_id }, ArnEquals = { "AWS:SourceArn" = aws_sesv2_configuration_set.mail.arn } }
  }] })
}
resource "aws_sesv2_configuration_set_event_destination" "feedback" {
  configuration_set_name = aws_sesv2_configuration_set.mail.configuration_set_name
  event_destination_name = "bounce-and-complaint"
  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT"]
    sns_destination { topic_arn = aws_sns_topic.feedback.arn }
  }
  depends_on = [aws_sns_topic_policy.feedback]
}
resource "aws_cognito_user_pool" "users" {
  name                     = "${local.name}-users"
  user_pool_tier           = "LITE"
  deletion_protection      = "ACTIVE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  username_configuration { case_sensitive = false }
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration { enabled = true }
  password_policy {
    minimum_length                   = 12
    require_lowercase                = false
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 1
  }
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  user_attribute_update_settings { attributes_require_verification_before_update = ["email"] }
  lambda_config {
    kms_key_id = aws_kms_key.sender.arn
    custom_email_sender {
      lambda_arn     = aws_lambda_function.intake.arn
      lambda_version = "V1_0"
    }
  }
  lifecycle { prevent_destroy = true }
}
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.users.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = ["${var.app_origin}/api/v1/auth/cognito/callback"]
  logout_urls                          = ["${var.app_origin}/login"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  access_token_validity                = 15
  id_token_validity                    = 15
  refresh_token_validity               = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
  read_attributes  = ["email", "email_verified", "given_name", "family_name"]
  write_attributes = ["email", "given_name", "family_name"]
}
resource "aws_cognito_user_pool_domain" "users" {
  domain       = "${local.name}-${var.aws_account_id}"
  user_pool_id = aws_cognito_user_pool.users.id
}
resource "aws_lambda_permission" "cognito" {
  statement_id   = "CognitoEmailSender"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.intake.function_name
  principal      = "cognito-idp.amazonaws.com"
  source_arn     = aws_cognito_user_pool.users.arn
  source_account = var.aws_account_id
}
