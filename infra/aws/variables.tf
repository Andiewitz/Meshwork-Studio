variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the intended 12-digit AWS account ID."
  }
}
variable "environment" {
  type    = string
  default = "prod"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "Use a short lowercase environment name."
  }
}
variable "ec2_instance_id" {
  type = string
  validation {
    condition     = can(regex("^i-[a-f0-9]{8,17}$", var.ec2_instance_id))
    error_message = "Supply the existing EC2 instance ID."
  }
}
variable "ec2_role_name" {
  description = "Existing IAM role attached to EC2. Attach a role/instance profile first if it has none."
  type        = string
}
variable "app_origin" {
  type = string
  validation {
    condition     = can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", var.app_origin))
    error_message = "Use the public HTTPS origin without a path or trailing slash."
  }
}
variable "email_domain" {
  description = "Domain to verify in SES. DNS records are outputs; existing DNS is not modified."
  type        = string
}
variable "email_from" {
  type = string
  validation {
    condition     = endswith(var.email_from, "@${var.email_domain}")
    error_message = "The sender must belong to email_domain."
  }
}
variable "alert_email" {
  type = string
}
variable "daily_email_limit" {
  type    = number
  default = 100
  validation {
    condition     = var.daily_email_limit >= 1 && var.daily_email_limit <= 1000 && floor(var.daily_email_limit) == var.daily_email_limit
    error_message = "Use 1–1000 send attempts/day."
  }
}
variable "backup_retention_days" {
  type    = number
  default = 14
  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 90
    error_message = "Choose 7–90 days."
  }
}
variable "monthly_addon_budget" {
  type    = number
  default = 5
}
variable "monthly_account_budget" {
  description = "Account-wide alert threshold, including existing EC2/EBS. Adjust to actual spend."
  type        = number
  default     = 30
}
variable "canvas_table_name" {
  description = "Existing canvas table; Terraform grants backup read permissions but never creates/replaces it. Enable PITR separately."
  type        = string
  default     = "meshwork-canvas"
}
variable "github_repository" {
  type    = string
  default = "Andiewitz/Meshwork-Studio"
}
variable "github_environment" {
  type    = string
  default = "production"
}
variable "github_oidc_provider_arn" {
  description = "Reuse the account's existing GitHub provider ARN, or null to create one."
  type        = string
  default     = null
}
variable "app_directory" {
  type    = string
  default = "/home/ubuntu/meshwork-studiov2"
  validation {
    condition     = can(regex("^/home/ubuntu/[a-zA-Z0-9/_-]+$", var.app_directory))
    error_message = "Use an absolute ubuntu-owned path without shell metacharacters."
  }
}
