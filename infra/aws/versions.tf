terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Project     = "meshwork-studio"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_partition" "current" {}
locals {
  name          = "meshwork-${var.environment}"
  partition     = data.aws_partition.current.partition
  namespace     = "Meshwork/${var.environment}"
  backup_prefix = "daily/"
}
