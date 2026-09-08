# RDS Setup Commands

# Run these in AWS Console or via AWS CLI after EC2 is running

# 1. Create DB Subnet Group (need 2+ subnets in different AZs)

aws rds create-db-subnet-group \
--db-subnet-group-name meshwork-db-subnet \
--db-subnet-group-description "Meshwork DB subnet group" \
--subnet-ids subnet-xxx subnet-yyy

# 2. Create Security Group for RDS (allow from EC2 SG only)

aws ec2 create-security-group \
--group-name meshwork-rds-sg \
--description "RDS access from EC2 only" \
--vpc-id vpc-xxx

# Get EC2 SG ID, then allow inbound 5432 from it

aws ec2 authorize-security-group-ingress \
--group-id sg-rds-xxx \
--protocol tcp --port 5432 \
--source-group sg-ec2-xxx

# 3. Create RDS instance (db.t3.micro, free tier)

aws rds create-db-instance \
--db-instance-identifier meshwork-db \
--db-instance-class db.t3.micro \
--engine postgres \
--engine-version 15.4 \
--allocated-storage 20 \
--storage-type gp3 \
--db-name emnesh_workspace \
--master-username admin \
--master-user-password "your-secure-password" \
--vpc-security-group-ids sg-rds-xxx \
--db-subnet-group-name meshwork-db-subnet \
--backup-retention-period 7 \
--no-multi-az \
--no-publicly-accessible \
--deletion-protection

> These settings are intentionally non-zero/non-destructive: snapshots on the
> same account are not a substitute for the verified off-host application
> archive, but zero retention and no deletion protection provide no recovery
> window at all. Use the [backup and recovery plan](../plans/Q5-BACKUP-AND-RECOVERY.md)
> before creating or modifying the production instance.

# 4. Wait for available, then create second database

# Connect via psql from EC2:

# psql -h your-rds-endpoint -U admin -d emnesh_workspace

# CREATE DATABASE emnesh_auth;

# 5. Update .env on EC2 with the RDS endpoint
