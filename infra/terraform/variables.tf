variable "region" {
  description = "AWS Region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 Instance type for the UORA node"
  type        = string
  default     = "c6i.2xlarge" # Compute optimized for low-latency workloads
}

variable "key_name" {
  description = "Name of the SSH key pair to use for EC2 access"
  type        = string
  default     = "uora-deploy-key"
}
