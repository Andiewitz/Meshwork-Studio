resource "aws_s3_bucket" "backups" {
  bucket        = "${local.name}-${var.aws_account_id}-db-backups"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket" "architecture_plans" {
  bucket        = "${local.name}-${var.aws_account_id}-architecture-plans"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_public_access_block" "architecture_plans" {
  bucket                  = aws_s3_bucket.architecture_plans.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "architecture_plans" {
  bucket = aws_s3_bucket.architecture_plans.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "architecture_plans" {
  bucket = aws_s3_bucket.architecture_plans.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*"
    Resource  = [aws_s3_bucket.architecture_plans.arn, "${aws_s3_bucket.architecture_plans.arn}/*"]
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.backups.arn, "${aws_s3_bucket.backups.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket     = aws_s3_bucket.backups.id
  depends_on = [aws_s3_bucket_versioning.backups]
  rule {
    id     = "BoundArchiveRetention"
    status = "Enabled"
    filter { prefix = local.backup_prefix }
    expiration { days = var.backup_retention_days }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
  rule {
    id     = "RemoveExpiredMarkers"
    status = "Enabled"
    filter { prefix = local.backup_prefix }
    expiration { expired_object_delete_marker = true }
  }
}
resource "aws_dynamodb_table" "mail" {
  name           = "${local.name}-mail-state"
  billing_mode   = "PROVISIONED"
  read_capacity  = 2
  write_capacity = 2
  hash_key       = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  # Disposable delivery state, not the existing durable canvas table.
}
