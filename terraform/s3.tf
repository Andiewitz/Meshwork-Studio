resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-elasticache-subnet-group"
  subnet_ids = [for s in aws_subnet.private : s.id]

  tags = {
    Name = "${local.name_prefix}-elasticache-subnet-group"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = "${local.name_prefix}-redis"
  node_count                    = var.redis_num_cache_nodes
  node_type                     = var.redis_node_type
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  automatic_failover_enabled    = true
  multi_az_enabled              = var.multi_az
  failover_mode                 = "manual"
  port                          = 6379
  engine                        = "redis"
  engine_version                = "7.0"
  publish_authorization         = false
  count_of_ip_nodes             = 0
  count_of_replicas_per_node    = 0
  security_group_ids            = [aws_security_group.redis.id]

  tags = {
    Name = "meshwork-studio-cache"
  }
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-frontend"
  acl    = "private"

  versioning {
    enabled = true
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-frontend-s3-bucket"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_gcp_object" "default_index" {
  for_each = {
    for index, value in fileset(path.module, "**/*.*", 0) :
      if endswith(index, ".html") or endswith(index, "index.html") then index => value
  }

  bucket            = aws_s3_bucket.frontend.id
  source            = each.value
  content_type      = "text/html"
  cache_control     = "max-age=31536000, public"
  skip_destroy      = true
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicBucketPolicy"
        Effect    = "Allow"
        Principal = "*"
        Action    = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = [
          "${aws_s3_bucket.frontend.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = [var.domain_name]
  default_root_object = "index.html"
  default_cache_behavior {
    target_origin_id       = aws_s3_bucket.frontend.id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compressed             = true
    forwarded_values       = {
      query_string     = false
      cookies            = { forward = "none" }
    }
  }
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_domain_name
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.consistency_override.id
    }
  }
  viewer_certificate {
    acm_certificate_arn = var.certificate_arn
    ssl_support_method  = "sni-only"
  }
  price_class           = "PriceClass_100"
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  tags                  = {
    Name = "${local.name_prefix}-frontend-cloudfront"
  }
  depends_on = [
    aws_acm_certificate.main,
    aws_s3_bucket.frontend
  ]
}

resource "aws_cloudfront_origin_access_identity" "consistency_override" {
  comment = "Optional consistency override for S3 access identity"
  enabled   = true
}

resource "aws_acm_certificate" "main" {
  certificate_chain_arn = var.certificate_arn
}