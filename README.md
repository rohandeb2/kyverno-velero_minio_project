Here’s a clean, **professional `README.md`** you can directly use for your project 👇

---

```markdown
# 🚀 Kubernetes Backup & Restore Project (Velero + MinIO + Kyverno)

This project demonstrates a **production-like DevOps workflow** involving:

- 🐳 Docker image build & push  
- ☸️ Kubernetes (KIND cluster) setup  
- 🔐 Policy enforcement using Kyverno  
- 💾 Backup & restore using Velero + MinIO  
- 🔥 Disaster recovery simulation  

---

## 📌 Project Architecture

```

Docker → Kubernetes (KIND) → Kyverno Policies → Application Deployment
↓
Velero Backup
↓
MinIO Storage

````

---

## 🛠️ Prerequisites

- Linux system (Ubuntu recommended)
- `sudo` access
- Internet connection

---

## ⚙️ Setup Environment

### 1. Install Docker

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt install -y docker.io

sudo systemctl enable docker
sudo systemctl start docker

docker ps
````

---

### 2. Build & Push Docker Image

```bash
docker login -u <your-username>

docker build -t <your-username>/notes-api:1.0.0 ./app
docker push <your-username>/notes-api:1.0.0
```

---

### 3. Install KIND (Kubernetes in Docker)

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
chmod +x kind
sudo mv kind /usr/local/bin/

kind version
```

---

### 4. Install kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

chmod +x kubectl
sudo mv kubectl /usr/local/bin/

kubectl version --client
```

---

### 5. Create Kubernetes Cluster

```bash
kind create cluster --name devops-lab
```

---

## 🔐 Install Kyverno (Policy Engine)

```bash
kubectl create -f https://github.com/kyverno/kyverno/releases/latest/download/install.yaml
kubectl apply -f kyverno/
```

---

## 🚀 Deploy Application

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml
```

---

## 🐞 Bug #1 — Kyverno Blocking Deployment

### ❌ Error

```
admission webhook "validate.kyverno.svc-fail" denied the request
```

### 🔍 Debug

```bash
kubectl get clusterpolicy
kubectl describe clusterpolicy disallow-latest-tag

kubectl get policyreport -A
kubectl describe policyreport -n app
```

### ✅ Fix

Update `deployment.yaml`:

* Replace:

```yaml
image: youruser/notes-api:latest
```

* With:

```yaml
image: youruser/notes-api:1.0.0
```

* Add labels:

```yaml
labels:
  env: dev
  team: backend
```

---

## 💾 Install Velero (Backup Tool)

```bash
curl -LO https://github.com/vmware-tanzu/velero/releases/download/v1.13.1/velero-v1.13.1-linux-amd64.tar.gz

tar -xvf velero-v1.13.1-linux-amd64.tar.gz
sudo mv velero-v1.13.1-linux-amd64/velero /usr/local/bin/

velero version
```

---

## ☁️ Setup MinIO (S3-compatible storage)

```bash
kubectl apply -f velero/velero_namespace.yaml

kubectl create secret generic velero-minio-creds \
  --namespace velero \
  --from-literal=cloud="[default]\naws_access_key=minio\naws_secret_key=minio123"

kubectl apply -f velero/minio-deployment.yaml
```

---

## 🔧 Install Velero with MinIO

```bash
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.9.0 \
  --bucket velero-backups \
  --secret-file ./credentials-velero \
  --use-volume-snapshots=false \
  --backup-location-config region=minio,s3ForcePathStyle=true,s3Url=http://minio.velero.svc:9000
```

---

## 📍 Configure Backup Storage Location

```bash
kubectl apply -f velero/bsl.yaml
kubectl get backupstoragelocation -n velero
```

---

## 🐞 Bug #2 — Bucket Not Found

### 🔍 Debug

```bash
kubectl describe backupstoragelocation default -n velero
kubectl logs deployment/velero -n velero | grep -i error
```

### ❌ Error Example

```
bucket 'velero-backups' does not exist
```

---

### ✅ Fix using MinIO Client (mc)

```bash
kubectl port-forward svc/minio 9000:9000 -n velero &

curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

mc alias set localminio http://localhost:9000 minio minio123
mc mb localminio/velero-backups
mc ls localminio
```

---

## 📦 Create Backup

```bash
velero backup create app-backup-01 --include-namespaces app
```

---

## 🔍 Verify Backup

```bash
velero backup get
velero backup describe app-backup-01 --details
velero backup logs app-backup-01
```

---

## 🧪 Verify in MinIO

```bash
mc ls localminio/velero-backups/
```

---

## 💥 Simulate Disaster

```bash
kubectl delete namespace app
```

---

## 🔄 Restore Application

```bash
velero restore create --from-backup app-backup-01

velero restore describe --last
kubectl get pods -n app -w
```

---

## ✅ Expected Outcome

* Application restored successfully
* Pods recreated
* Services & configs recovered
* Backup verified in MinIO

---

## 🧠 Key Learnings

* Policy enforcement using Kyverno
* Debugging admission controller failures
* Kubernetes backup strategies
* Object storage integration (MinIO)
* Disaster recovery workflow

---

## 📌 Useful Commands

```bash
velero backup get
velero restore get

kubectl get all -n app
kubectl get pods -n velero

mc ls localminio/velero-backups/
```

---

## 🙌 Conclusion

This project simulates a **real-world DevOps scenario**:

* Secure deployments (Kyverno)
* Reliable backups (Velero)
* Object storage (MinIO)
* Disaster recovery (Restore)

Perfect for:

* 🚀 DevOps Engineers
* ☸️ Kubernetes Learners
* 🎯 Interview preparation

---

Just say: **"make it portfolio ready"**
```
