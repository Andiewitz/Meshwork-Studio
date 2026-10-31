output "backup_s3_uri" { value = "s3://${aws_s3_bucket.backups.id}/${local.backup_prefix}" }
# Only public IDs/URLs are exported. SecureString secrets are never managed here.
output "runtime_parameters" { value = { for name, parameter in aws_ssm_parameter.runtime : name => nonsensitive(parameter.value) } }
output "ses_dkim_records" {
  value = flatten([for attributes in aws_sesv2_email_identity.sender.dkim_signing_attributes : [for token in attributes.tokens : { name = "${token}._domainkey.${var.email_domain}", type = "CNAME", value = "${token}.dkim.amazonses.com" }]])
}
output "cloudwatch_agent_parameter" { value = aws_ssm_parameter.agent.name }
output "github_deploy_role_arn" { value = aws_iam_role.deploy.arn }
output "ssm_deploy_document" { value = aws_ssm_document.deploy.name }
output "email_queue_url" { value = aws_sqs_queue.mail.id }
output "cognito_login_url" { value = "${var.app_origin}/api/v1/auth/cognito" }
output "deploy_wrapper" {
  value = templatefile("${path.module}/templates/deploy.sh.tftpl", { app_directory = var.app_directory, name = local.name })
}
