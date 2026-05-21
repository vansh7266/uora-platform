provider "aws" {
  region = var.region
}

# Restricted SSH access CIDR — tighten further in production (e.g. VPN / bastion CIDR only)
variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to access SSH. Restrict to VPN/bastion in production."
  type        = string
  default     = "10.0.0.0/16"
}

variable "allowed_app_cidr" {
  description = "CIDR block allowed to reach non-public app ports. Expose 80/443 publicly and keep service ports private."
  type        = string
  default     = "10.0.0.0/16"
}

resource "aws_vpc" "uora_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "uora-vpc"
  }
}

resource "aws_internet_gateway" "uora_igw" {
  vpc_id = aws_vpc.uora_vpc.id

  tags = {
    Name = "uora-igw"
  }
}

resource "aws_subnet" "uora_subnet" {
  vpc_id                  = aws_vpc.uora_vpc.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "${var.region}a"

  tags = {
    Name = "uora-subnet-public"
  }
}

resource "aws_route_table" "uora_rt" {
  vpc_id = aws_vpc.uora_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.uora_igw.id
  }

  tags = {
    Name = "uora-rt-public"
  }
}

resource "aws_route_table_association" "uora_rta" {
  subnet_id      = aws_subnet.uora_subnet.id
  route_table_id = aws_route_table.uora_rt.id
}

resource "aws_security_group" "uora_sg" {
  name        = "uora-security-group"
  description = "Allow inbound traffic for UORA components"
  vpc_id      = aws_vpc.uora_vpc.id

  # HTTP/HTTPS
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Next.js Leaderboard
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_app_cidr]
  }

  # Reference Server / Submission API
  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_app_cidr]
  }
  
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.allowed_app_cidr]
  }

  # TimescaleDB
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # VPC internal only for safety
  }

  # Redis
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  # MinIO (VPC-internal only — never expose S3-compatible API to the internet)
  ingress {
    from_port   = 9000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  # SSH (restrict to VPC CIDR; tighten to bastion/VPN CIDR in production)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.allowed_ssh_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "uora-sg"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "uora-bot-fleet-cluster"
  cluster_version = "1.30"

  cluster_endpoint_public_access  = true

  vpc_id                   = aws_vpc.uora_vpc.id
  subnet_ids               = [aws_subnet.uora_subnet.id]
  control_plane_subnet_ids = [aws_subnet.uora_subnet.id]

  # EKS Managed Node Group(s)
  eks_managed_node_group_defaults = {
    instance_types = ["c6i.2xlarge", "m5.xlarge"]
  }

  eks_managed_node_groups = {
    bot_fleet = {
      min_size     = 2
      max_size     = 100
      desired_size = 5

      instance_types = ["c6i.2xlarge"]
      capacity_type  = "SPOT"
      
      labels = {
        role = "bot-fleet-worker"
      }

      tags = {
        ExtraTag = "UORA-Bot-Fleet"
      }
    }
    
    validators = {
      min_size     = 2
      max_size     = 10
      desired_size = 2

      instance_types = ["m6i.xlarge"]
      capacity_type  = "ON_DEMAND"
    }
  }

  tags = {
    Environment = "production"
    Project     = "UORA"
  }
}
