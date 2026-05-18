output "public_ip" {
  description = "Public IP of the UORA node"
  value       = aws_instance.uora_node.public_ip
}

output "ssh_command" {
  description = "Command to SSH into the node"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_instance.uora_node.public_ip}"
}
