# 🚀 DevOps Lab — Kubernetes, Kyverno & Velero

A hands-on DevOps lab that walks through containerising a Notes API, deploying it to a local Kubernetes cluster, enforcing policies with **Kyverno**, and implementing backup/restore with **Velero + MinIO**.

---

## Architecture Diagram

<div align="center">
  <img src="Screenshot 2026-05-06 235826.png" >
</div>

---
## 📋 Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. System Setup](#1-system-setup)
  - [2. Docker — Build & Push](#2-docker--build--push)
  - [3. Kind Cluster Setup](#3-kind-cluster-setup)
  - [4. Kyverno Policy Enforcement](#4-kyverno-policy-enforcement)
  - [5. Deploy the Application](#5-deploy-the-application)
  - [6. Velero Backup & Restore](#6-velero-backup--restore)
- [Bugs & Troubleshooting](#bugs--troubleshooting)
- [License](#license)

-----

## Overview

This lab covers a full DevOps workflow on a local Kubernetes cluster:

|Tool       |Purpose                           |
|-----------|----------------------------------|
|**Docker** |Containerise the Notes API        |
|**Kind**   |Local Kubernetes cluster          |
|**Kyverno**|Policy-as-code enforcement        |
|**Velero** |Backup & disaster recovery        |
|**MinIO**  |S3-compatible local object storage|

-----

## Prerequisites

Make sure the following are available on your machine before starting:

- Ubuntu (or a Debian-based Linux distro)
- `curl` and `tar`
- Docker Hub account
- Sufficient disk space for images and backups

-----

## Project Structure

```
.
├── app/                    # Notes API source code & Dockerfile
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── pvc.yaml
│   ├── service.yaml
│   └── deployment.yaml
├── kyverno/                # Kyverno ClusterPolicy manifests
├── velero/
│   ├── velero_namespace.yaml
│   ├── minio-deployment.yaml
│   ├── bsl.yaml            # BackupStorageLocation
│   └── backup.yaml
└── credentials-velero      # MinIO credentials file (not committed)
```

-----

## Getting Started

### 1. System Setup

Update your system and install Docker:

```bash
sudo apt-get update && sudo apt-get upgrade
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
docker ps   # verify Docker is running
```

### 2. Docker — Build & Push

Log in to Docker Hub, build the image, and push it:

```bash
docker login -u <your-username>
docker build -t youruser/notes-api:1.0.0 ./app
docker push youruser/notes-api:1.0.0
```

> ⚠️ **Important:** Always use a pinned version tag (e.g., `:1.0.0`). The `:latest` tag is blocked by Kyverno policy. See [Bug #1](#bug-1--kyverno-blocks-your-deployment).

### 3. Kind Cluster Setup

Install **Kind** and **kubectl**, then create your cluster:

```bash
# Install Kind
curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
chmod +x kind && sudo mv kind /usr/local/bin/
kind version

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
kubectl version --client

# Create the cluster
kind create cluster --name devops-lab
```

### 4. Kyverno Policy Enforcement

Install Kyverno and apply the lab policies:

```bash
kubectl create -f https://github.com/kyverno/kyverno/releases/latest/download/install.yaml
kubectl apply -f kyverno/
```

Active policies in this lab:

|Policy               |Rule                                           |
|---------------------|-----------------------------------------------|
|`disallow-latest-tag`|Images must be pinned to a specific version tag|
|`require-pod-labels` |Pods must have `env` and `team` labels         |

### 5. Deploy the Application

Apply the Kubernetes manifests in order:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
```

### 6. Velero Backup & Restore

#### Install Velero CLI

```bash
curl -LO https://github.com/vmware-tanzu/velero/releases/download/v1.13.1/velero-v1.13.1-linux-amd64.tar.gz
tar -xvf velero-v1.13.1-linux-amd64.tar.gz
sudo mv velero-v1.13.1-linux-amd64/velero /usr/local/bin/
velero version
```

#### Deploy MinIO and Velero

```bash
kubectl apply -f velero/velero_namespace.yaml

kubectl create secret generic velero-minio-creds \
  --namespace velero \
  --from-literal=cloud="[default]\naws_access_key=minio\naws_secret_key=minio123"

kubectl apply -f velero/minio-deployment.yaml

velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.9.0 \
  --bucket velero-backups \
  --secret-file ./credentials-velero \
  --use-volume-snapshots=false \
  --backup-location-config region=minio,s3ForcePathStyle=true,s3Url=http://minio.velero.svc:9000

kubectl apply -f velero/bsl.yaml
kubectl get backupstoragelocation -n velero
```

#### Create a Backup

```bash
kubectl apply -f velero/backup.yaml
velero backup describe app-backup-01 --details
velero backup logs app-backup-01

# Verify files in MinIO
mc ls localminio/velero-backups/
```

#### Simulate Disaster & Restore

```bash
kubectl delete namespace app
velero restore create --from-backup app-backup-01
velero restore describe --last
kubectl get pods -n app -w
```

-----

## Bugs & Troubleshooting

### Bug #1 — Kyverno Blocks Your Deployment

**Error:**

```
admission webhook "validate.kyverno.svc-fail" denied the request:
resource Deployment/app/notes-api was blocked due to the following policies
disallow-latest-tag:
  require-image-tag: "Using ':latest' tag is not allowed. Pin to a specific version e.g. :1.0.0"
require-pod-labels:
  check-required-labels: "Pods must have 'env' and 'team' labels."
```

**Debug commands:**

```bash
kubectl get clusterpolicy
kubectl describe clusterpolicy disallow-latest-tag
kubectl get policyreport -A
kubectl describe policyreport -n app
```

**Fix:** Edit `k8s/deployment.yaml`:

1. Change `image: youruser/notes-api:latest` → `youruser/notes-api:1.0.0`
1. Add labels under the pod template:
   
   ```yaml
   labels:
     env: dev
     team: backend
   ```

Then re-apply: `kubectl apply -f k8s/deployment.yaml`

-----

### Bug #2 — Velero BackupStorageLocation Unavailable

**Symptoms:** `kubectl get backupstoragelocation -n velero` shows status `Unavailable`.

**Debug commands:**

```bash
kubectl describe backupstoragelocation default -n velero
kubectl logs deployment/velero -n velero --tail=60 | grep -i error
kubectl get pods -n velero
kubectl logs deployment/minio -n velero
```

**Common cause:** The `velero-backups` bucket does not exist in MinIO.

**Fix:** Create the bucket using the MinIO CLI:

```bash
# Install mc
curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && sudo mv mc /usr/local/bin/

# Port-forward MinIO
kubectl port-forward svc/minio 9000:9000 -n velero &

# Set alias and create bucket
mc alias set localminio http://localhost:9000 minio minio123
mc mb localminio/velero-backups
mc ls localminio
```

> ⚠️ **Note:** The original command contains a typo — `http://localhsot:9000` should be `http://localhost:9000`.

Then verify the BSL recovers: `kubectl get backupstoragelocation -n velero`

-----

## License

This project is provided for educational purposes. Feel free to adapt it for your own DevOps learning environment.
