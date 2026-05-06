# 📚 Deep Dive — Kyverno, Velero & MinIO

> A comprehensive learning guide covering the core concepts, architecture, commands, and real-world usage of the three key tools used in this DevOps lab.

-----

## Table of Contents

- [🛡️ Kyverno — Policy Engine for Kubernetes](#️-kyverno--policy-engine-for-kubernetes)
  - [What Problem Does It Solve?](#what-problem-does-it-solve)
  - [How Kyverno Works](#how-kyverno-works)
  - [Policy Types](#policy-types)
  - [ClusterPolicy vs Policy](#clusterpolicy-vs-policy)
  - [Admission Webhook Deep Dive](#admission-webhook-deep-dive)
  - [Policy Rules Explained](#policy-rules-explained)
  - [PolicyReports](#policyreports)
  - [Kyverno in This Lab](#kyverno-in-this-lab)
  - [Real-World Use Cases](#real-world-use-cases-kyverno)
  - [Useful Commands](#useful-commands-kyverno)
- [💾 Velero — Backup & Disaster Recovery](#-velero--backup--disaster-recovery)
  - [What Problem Does It Solve?](#what-problem-does-it-solve-1)
  - [How Velero Works](#how-velero-works)
  - [Core Components](#core-components)
  - [Backup Deep Dive](#backup-deep-dive)
  - [Restore Deep Dive](#restore-deep-dive)
  - [Scheduled Backups](#scheduled-backups)
  - [Hooks — Pre & Post Backup](#hooks--pre--post-backup)
  - [Velero in This Lab](#velero-in-this-lab)
  - [Real-World Use Cases](#real-world-use-cases-velero)
  - [Useful Commands](#useful-commands-velero)
- [🪣 MinIO — S3-Compatible Object Storage](#-minio--s3-compatible-object-storage)
  - [What Problem Does It Solve?](#what-problem-does-it-solve-2)
  - [How MinIO Works](#how-minio-works)
  - [Core Concepts](#core-concepts)
  - [MinIO vs AWS S3](#minio-vs-aws-s3)
  - [The `mc` CLI Deep Dive](#the-mc-cli-deep-dive)
  - [MinIO in This Lab](#minio-in-this-lab)
  - [Real-World Use Cases](#real-world-use-cases-minio)
  - [Useful Commands](#useful-commands-minio)
- [🔗 How All Three Work Together](#-how-all-three-work-together)

-----

## 🛡️ Kyverno — Policy Engine for Kubernetes

### What Problem Does It Solve?

In Kubernetes, anyone with `kubectl apply` access can deploy almost anything — containers with root privileges, images pulled from unknown registries, pods missing critical labels, or configs that violate your company’s security standards.

**Without Kyverno**, you rely on:

- Developer discipline (unreliable)
- Manual code reviews (slow and inconsistent)
- Post-deployment audits (too late)

**With Kyverno**, you define rules as Kubernetes-native YAML policies. These rules are enforced automatically at the point of admission — before a resource even exists in the cluster.

Think of Kyverno as a **security guard at the cluster door**. No resource gets in without passing inspection.

-----

### How Kyverno Works

```
kubectl apply -f deployment.yaml
        │
        ▼
┌─────────────────────┐
│   API Server        │
│                     │
│  1. Authentication  │
│  2. Authorization   │
│  3. Admission       │◄──── Kyverno Webhook intercepts here
│     (Webhooks)      │
│  4. Persist to etcd │
└─────────────────────┘
```

Kyverno registers itself as a **Mutating and Validating Admission Webhook** with the Kubernetes API Server. When you apply a resource:

1. The API Server receives the request
1. It calls Kyverno’s webhook with the resource payload
1. Kyverno evaluates all matching policies
1. Kyverno returns `ALLOW` or `DENY` (with an error message)
1. If allowed, the resource is persisted to etcd

This all happens **synchronously** — the `kubectl apply` command blocks until Kyverno responds.

-----

### Policy Types

Kyverno supports four types of rules within a policy:

|Type            |What It Does                               |Example                                            |
|----------------|-------------------------------------------|---------------------------------------------------|
|**Validate**    |Blocks resources that don’t meet a rule    |Deny `:latest` image tags                          |
|**Mutate**      |Automatically modifies resources           |Add default labels if missing                      |
|**Generate**    |Creates new resources when a trigger occurs|Auto-create a NetworkPolicy for every new namespace|
|**VerifyImages**|Checks image signatures and attestations   |Only allow images signed by your org               |

-----

### ClusterPolicy vs Policy

|Feature   |`ClusterPolicy`          |`Policy`               |
|----------|-------------------------|-----------------------|
|Scope     |Entire cluster           |Single namespace       |
|Use case  |Global security standards|Team/app-specific rules|
|Applied to|All namespaces           |One namespace only     |

```yaml
# ClusterPolicy — applies everywhere
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag

# Policy — applies to one namespace
apiVersion: kyverno.io/v1
kind: Policy
metadata:
  name: require-team-labels
  namespace: app
```

-----

### Admission Webhook Deep Dive

Kyverno registers two webhooks:

- **`validate.kyverno.svc`** — for validation rules (blocks requests)
- **`mutate.kyverno.svc`** — for mutation rules (modifies requests)

The `-fail` suffix in the error message (`validate.kyverno.svc-fail`) means the webhook is set to **Fail Closed** — if Kyverno itself is down or unreachable, all requests are denied. This is the secure default.

The alternative is **Fail Open** — if Kyverno is unreachable, requests are allowed through. Less secure but more available.

```yaml
# Webhook failure policy
failurePolicy: Fail   # Fail Closed (secure default)
failurePolicy: Ignore # Fail Open (more available, less secure)
```

-----

### Policy Rules Explained

A Kyverno policy rule has three parts:

```yaml
rules:
  - name: require-image-tag        # Rule name (appears in error messages)
    match:                         # What resources this rule applies to
      any:
      - resources:
          kinds:
            - Pod
    validate:                      # What to check
      message: "Using ':latest' tag is not allowed. Pin to a specific version e.g. :1.0.0"
      pattern:
        spec:
          containers:
          - image: "*:*"           # Image must have a tag (wildcard:wildcard)
```

**Pattern matching operators:**

|Operator      |Meaning                |
|--------------|-----------------------|
|`*`           |Any value              |
|`?`           |Any single character   |
|`!value`      |Not equal to value     |
|`>5`          |Greater than 5         |
|`$(reference)`|Reference another field|

-----

### PolicyReports

Kyverno generates `PolicyReport` and `ClusterPolicyReport` resources that record:

- Which resources were scanned
- Which policies passed or failed
- Background scan results (even for resources that existed before the policy was created)

```bash
# View all policy reports across all namespaces
kubectl get policyreport -A

# Describe a specific report
kubectl describe policyreport -n app

# View as YAML for full detail
kubectl get policyreport -n app -o yaml
```

A PolicyReport entry looks like:

```yaml
results:
- message: "Using ':latest' tag is not allowed."
  policy: disallow-latest-tag
  result: fail
  rule: require-image-tag
  resources:
  - apiVersion: apps/v1
    kind: Deployment
    name: notes-api
    namespace: app
```

-----

### Kyverno in This Lab

This lab uses two ClusterPolicies:

**1. `disallow-latest-tag`**

- Ensures all container images are pinned to a specific version
- Prevents unpredictable deployments from silently pulling a different image

**2. `require-pod-labels`**

- Enforces that all pods have `env` and `team` labels
- Critical for cost attribution, monitoring dashboards, and RBAC

When you first run `kubectl apply -f k8s/deployment.yaml`, both policies fire and block the deployment. This is **intentional** — the bug is a learning exercise.

-----

### Real-World Use Cases {#real-world-use-cases-kyverno}

- Block privileged containers and host path mounts
- Require resource limits on all pods (prevent noisy neighbours)
- Auto-inject sidecar containers (like Istio or logging agents)
- Enforce image registry allowlists (only pull from your private registry)
- Auto-generate NetworkPolicies, LimitRanges, and ResourceQuotas per namespace
- Verify Cosign-signed images before allowing deployment

-----

### Useful Commands {#useful-commands-kyverno}

```bash
# List all cluster-wide policies and their status
kubectl get clusterpolicy

# Describe a specific policy to see all rules
kubectl describe clusterpolicy <policy-name>

# List all policy reports (per namespace)
kubectl get policyreport -A

# Describe violations in a namespace
kubectl describe policyreport -n <namespace>

# Check Kyverno controller logs
kubectl logs -n kyverno -l app.kubernetes.io/name=kyverno --tail=50

# Test a policy against a resource without applying it (dry-run)
kyverno apply ./kyverno/policy.yaml --resource ./k8s/deployment.yaml
```

-----

## 💾 Velero — Backup & Disaster Recovery

### What Problem Does It Solve?

Kubernetes clusters hold critical state:

- Workload definitions (Deployments, StatefulSets, Services)
- Configuration (ConfigMaps, Secrets)
- Persistent data (PersistentVolumeClaims)
- RBAC rules, Ingresses, Custom Resources

Any of the following can destroy this state instantly:

- `kubectl delete namespace app` (human error)
- A bad Helm upgrade
- A ransomware attack
- A failed cluster migration
- A cloud provider outage

**Velero** solves this by snapshotting your entire cluster state — resources and volumes — and storing it in object storage. When disaster strikes, you restore from the snapshot.

-----

### How Velero Works

```
┌─────────────────────────────────────────┐
│           Kubernetes Cluster            │
│                                         │
│  ┌──────────┐     ┌──────────────────┐  │
│  │  Velero  │────►│  K8s API Server  │  │
│  │  Server  │     │  (reads resources│  │
│  └────┬─────┘     └──────────────────┘  │
│       │                                 │
└───────┼─────────────────────────────────┘
        │
        ▼
┌───────────────────┐
│   Object Storage  │  (MinIO / AWS S3 / GCS / Azure Blob)
│                   │
│  backup-01/
│  ├── resources/   │  ← All K8s resource manifests (JSON)
│  ├── volumes/     │  ← PV snapshots or Restic backups
│  └── metadata/   │
└───────────────────┘
```

Velero runs as a **Deployment** inside your cluster. It uses the Kubernetes API to read all resources and serialises them to JSON, then uploads them to your configured storage backend.

-----

### Core Components

|Component                       |Description                                                |
|--------------------------------|-----------------------------------------------------------|
|**Velero Server**               |Deployment running inside the cluster, does the actual work|
|**BackupStorageLocation (BSL)** |Tells Velero where to store backups (bucket + credentials) |
|**VolumeSnapshotLocation (VSL)**|Tells Velero how to snapshot persistent volumes            |
|**Backup CR**                   |A custom resource that triggers a backup                   |
|**Restore CR**                  |A custom resource that triggers a restore                  |
|**Schedule CR**                 |A cron-based custom resource for automated backups         |
|**Plugin**                      |Provider-specific code (AWS, GCP, Azure, MinIO)            |

-----

### Backup Deep Dive

When a `Backup` resource is created, Velero:

1. Queries the Kubernetes API for all matching resources
1. Applies any label selectors or namespace filters
1. Serialises each resource to JSON
1. Runs any **pre-backup hooks** (e.g. flush database writes)
1. Uploads resource JSON to object storage
1. Triggers volume snapshots (if configured)
1. Runs any **post-backup hooks**
1. Updates the `Backup` CR with the result

```yaml
# Example Backup manifest
apiVersion: velero.io/v1
kind: Backup
metadata:
  name: app-backup-01
  namespace: velero
spec:
  includedNamespaces:
    - app                    # Only back up the 'app' namespace
  storageLocation: default   # References the BSL
  ttl: 720h                  # Backup expires after 30 days
```

**Backup phases:**

|Phase            |Meaning              |
|-----------------|---------------------|
|`New`            |Just created         |
|`InProgress`     |Backup running       |
|`Completed`      |Success              |
|`Failed`         |Error occurred       |
|`PartiallyFailed`|Some resources failed|
|`Deleting`       |Being cleaned up     |

-----

### Restore Deep Dive

When you run `velero restore create --from-backup app-backup-01`, Velero:

1. Downloads the backup archive from object storage
1. Iterates through all backed-up resources
1. Skips resources that already exist (unless `--existing-resource-policy=update`)
1. Re-creates resources in the correct order (Namespaces first, then ConfigMaps, Secrets, PVCs, then Pods)
1. Waits for PVCs to bind before creating pods
1. Runs post-restore hooks

```bash
# Restore specific namespace only
velero restore create --from-backup app-backup-01 \
  --include-namespaces app

# Restore into a different namespace
velero restore create --from-backup app-backup-01 \
  --namespace-mappings app:app-restored

# Restore a specific resource type only
velero restore create --from-backup app-backup-01 \
  --include-resources deployments,services
```

-----

### Scheduled Backups

For production, you should never rely on manual backups. Use a `Schedule`:

```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-app-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"        # Every day at 2am
  template:
    includedNamespaces:
      - app
    storageLocation: default
    ttl: 168h                  # Keep for 7 days
```

```bash
# List all schedules
velero schedule get

# Trigger a scheduled backup manually
velero backup create --from-schedule daily-app-backup
```

-----

### Hooks — Pre & Post Backup

Hooks let you run commands inside your containers before/after a backup. Critical for databases — you want to flush writes to disk before snapshotting.

```yaml
# Add to your Deployment annotations
annotations:
  pre.hook.backup.velero.io/command: '["/bin/bash", "-c", "psql -c CHECKPOINT"]'
  pre.hook.backup.velero.io/container: postgres
  post.hook.backup.velero.io/command: '["/bin/bash", "-c", "echo backup done"]'
```

-----

### Velero in This Lab

1. Velero is installed with the **AWS plugin** configured to point at MinIO instead of real AWS S3
1. A `BackupStorageLocation` tells Velero to use the `velero-backups` MinIO bucket
1. `backup.yaml` triggers a full backup of the `app` namespace
1. The namespace is deleted to simulate a disaster
1. `velero restore create` brings everything back

The key learning: **a backup you’ve never tested is not a backup**. This lab forces you to test the restore.

-----

### Real-World Use Cases {#real-world-use-cases-velero}

- Nightly automated backups of production namespaces
- Pre-upgrade snapshots before Helm or Kubernetes version upgrades
- Cross-cluster migration (backup from cluster A, restore to cluster B)
- Compliance and audit requirements (retain backups for 90 days)
- Dev environment seeding (restore prod backup into staging)

-----

### Useful Commands {#useful-commands-velero}

```bash
# List all backups
velero backup get

# Detailed backup info including warnings
velero backup describe app-backup-01 --details

# View backup logs
velero backup logs app-backup-01

# List all restores
velero restore get

# Describe the most recent restore
velero restore describe --last

# Delete a backup
velero backup delete app-backup-01

# Check BSL status
kubectl get backupstoragelocation -n velero

# View Velero server logs
kubectl logs deployment/velero -n velero --tail=100
```

-----

## 🪣 MinIO — S3-Compatible Object Storage

### What Problem Does It Solve?

AWS S3 is the gold standard for object storage. Almost every modern tool (Velero, MLflow, Airflow, Spark) supports it. But:

- S3 costs money
- S3 requires internet access
- Regulated industries can’t store data outside their own infrastructure
- Air-gapped environments have no cloud access at all

**MinIO** gives you a **100% S3-compatible API** that runs anywhere — inside your Kubernetes cluster, on bare metal, or on a laptop. Any tool that talks to S3 talks to MinIO without a single code change.

-----

### How MinIO Works

```
┌──────────────────────────────────────┐
│           MinIO Server               │
│                                      │
│  HTTP/S3 API (:9000)                 │
│  Web Console (:9001)                 │
│                                      │
│  ┌──────────┐   ┌──────────────┐     │
│  │  Bucket  │   │  Bucket      │     │
│  │  velero- │   │  my-app-     │     │
│  │  backups │   │  uploads     │     │
│  └──────────┘   └──────────────┘     │
│       │               │              │
│  ┌────▼───────────────▼────────┐     │
│  │     Persistent Volume       │     │
│  │    (actual disk storage)    │     │
└──┴─────────────────────────────┴─────┘
```

MinIO stores objects on a regular filesystem. A **bucket** maps to a directory. An **object** maps to a file. The S3 API is just an HTTP layer on top.

-----

### Core Concepts

|Concept                 |Description                       |S3 Equivalent        |
|------------------------|----------------------------------|---------------------|
|**Bucket**              |Top-level container for objects   |S3 Bucket            |
|**Object**              |Any file stored in a bucket       |S3 Object            |
|**Access Key**          |Username for authentication       |AWS Access Key ID    |
|**Secret Key**          |Password for authentication       |AWS Secret Access Key|
|**Path-style URL**      |`http://host:9000/bucket/key`     |Used when not on AWS |
|**Virtual-hosted style**|`http://bucket.host/key`          |AWS default          |
|**Alias**               |A named connection profile in `mc`|AWS CLI profile      |

-----

### MinIO vs AWS S3

|Feature          |MinIO                         |AWS S3                 |
|-----------------|------------------------------|-----------------------|
|API compatibility|100% S3-compatible            |Native                 |
|Cost             |Free (self-hosted)            |Pay per GB + requests  |
|Deployment       |Kubernetes, Docker, bare metal|AWS only               |
|Internet required|No                            |Yes                    |
|Scalability      |Horizontal (distributed mode) |Unlimited (managed)    |
|Compliance       |Full data sovereignty         |Dependent on AWS region|
|Web Console      |Built-in at `:9001`           |AWS Console            |

For this lab, MinIO is **a drop-in replacement for S3**. Velero doesn’t know it’s talking to MinIO — it just sees an S3-compatible endpoint.

-----

### The `mc` CLI Deep Dive

`mc` is the official MinIO Client. It mirrors Unix commands but for object storage.

```bash
# Set up a connection alias (do this once)
mc alias set localminio http://localhost:9000 minio minio123
#            ^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^ ^^^^^ ^^^^^^^^
#            alias name  endpoint             user  password

# Create a bucket
mc mb localminio/velero-backups

# List all buckets
mc ls localminio

# List objects in a bucket
mc ls localminio/velero-backups/

# Upload a file
mc cp myfile.txt localminio/velero-backups/

# Download a file
mc cp localminio/velero-backups/myfile.txt ./

# Delete an object
mc rm localminio/velero-backups/myfile.txt

# Delete a bucket (must be empty)
mc rb localminio/velero-backups

# Mirror a local directory to a bucket
mc mirror ./backups/ localminio/velero-backups/

# Watch a bucket for new objects in real time
mc watch localminio/velero-backups
```

-----

### MinIO in This Lab

MinIO runs as a **Deployment** inside the `velero` namespace. Velero is configured to use it as its `BackupStorageLocation` via:

- **Endpoint:** `http://minio.velero.svc:9000` (Kubernetes internal DNS)
- **Bucket:** `velero-backups`
- **Credentials:** `minio` / `minio123`
- **Force Path Style:** `true` — required for non-AWS S3 endpoints

The most common bug is that **the bucket doesn’t exist yet** when Velero first connects. MinIO doesn’t auto-create buckets. You must run `mc mb localminio/velero-backups` first.

> ⚠️ **Typo to watch for:** In the lab setup, the alias command contains `http://localhsot:9000` — this is a typo. The correct value is `http://localhost:9000`.

-----

### Real-World Use Cases {#real-world-use-cases-minio}

- Velero backup storage (this lab)
- ML model artifact storage (MLflow, Kubeflow)
- Data pipeline staging (Apache Spark, Airflow)
- On-premise media storage
- Replacing S3 in air-gapped / regulated environments
- Local development — test S3 integrations without AWS costs

-----

### Useful Commands {#useful-commands-minio}

```bash
# Port-forward MinIO to access it locally
kubectl port-forward svc/minio 9000:9000 -n velero &

# Set up mc alias
mc alias set localminio http://localhost:9000 minio minio123

# Verify the connection works
mc admin info localminio

# Create the Velero backup bucket
mc mb localminio/velero-backups

# List all buckets
mc ls localminio

# List all backup files inside the Velero bucket
mc ls localminio/velero-backups/

# Watch bucket for incoming backup files in real time
mc watch localminio/velero-backups

# Check MinIO pod logs
kubectl logs deployment/minio -n velero

# Check MinIO pod status
kubectl get pods -n velero
```

-----

## 🔗 How All Three Work Together

Here’s the full picture of how Kyverno, Velero, and MinIO interact in this lab:

```
Developer
    │
    │  kubectl apply -f k8s/deployment.yaml
    ▼
┌─────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                  │
│                                                     │
│  ┌──────────┐   DENY (policy violation)             │
│  │ Kyverno  │◄──── validates every resource         │
│  │  Webhook │      before it reaches the cluster    │
│  └──────────┘                                       │
│       │ ALLOW (after fixing tags + labels)          │
│       ▼                                             │
│  ┌──────────────────────────┐                       │
│  │     app namespace        │                       │
│  │  ┌────────────────────┐  │                       │
│  │  │   notes-api Pod    │  │                       │
│  │  │   (running ✅)     │  │                       │
│  │  └────────────────────┘  │                       │
│  └──────────────────────────┘                       │
│                                                     │
│  ┌──────────┐   backs up app namespace              │
│  │  Velero  │──────────────────────────►  MinIO     │
│  │  Server  │   restores on disaster    (velero     │
│  └──────────┘◄──────────────────────────  namespace)│
└─────────────────────────────────────────────────────┘
```

**The workflow:**

1. **Kyverno** acts as the gatekeeper — nothing gets deployed unless it meets policy
1. **Velero** takes snapshots of everything that passes Kyverno and runs successfully
1. **MinIO** stores those snapshots durably inside the cluster
1. On disaster, **Velero** pulls from **MinIO** and reconstructs the entire namespace
1. Resources come back already compliant — **Kyverno** will validate them again on restore

This is a complete **secure → deploy → backup → recover** cycle. Each tool handles one responsibility, and together they form a production-grade safety net.

-----

> 💡 **Further Reading**
> 
> - [Kyverno Docs](https://kyverno.io/docs/)
> - [Velero Docs](https://velero.io/docs/)
> - [MinIO Docs](https://min.io/docs/)
> - [Kubernetes Admission Controllers](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)
