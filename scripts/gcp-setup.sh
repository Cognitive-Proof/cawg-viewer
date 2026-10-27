#!/usr/bin/env bash
# One-time Google Cloud setup for deploying the viewer from GitHub Actions
# (.github/workflows/deploy.yml). Safe to re-run: each step checks first.
#
#   scripts/gcp-setup.sh <project-id> [region] [github-repo]
#
# Needs: gcloud (authenticated, with owner or equivalent on the project) and
# gh (authenticated, admin on the repository) to set the repository variables.
set -euo pipefail

PROJECT_ID=${1:?usage: scripts/gcp-setup.sh <project-id> [region] [github-repo]}
REGION=${2:-northamerica-northeast2}
REPO=${3:-Cognitive-Proof/cawg-viewer}

POOL=github
PROVIDER=github
AR_REPO=cawg-viewer
RUN_SA=cawg-viewer-run@${PROJECT_ID}.iam.gserviceaccount.com
DEPLOY_SA=cawg-viewer-deployer@${PROJECT_ID}.iam.gserviceaccount.com

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }
step() { printf '\n== %s\n' "$*"; }

step "Project $PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
billing=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)
[[ "$billing" == "True" ]] || { echo "Billing is not enabled on $PROJECT_ID; link a billing account first." >&2; exit 1; }

step "APIs"
g services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

step "Artifact Registry repository $AR_REPO ($REGION)"
g artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 \
  || g artifacts repositories create "$AR_REPO" --location "$REGION" --repository-format docker \
       --description "CAWG viewer images"

step "Service accounts"
g iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 \
  || g iam service-accounts create cawg-viewer-run --display-name "CAWG viewer (Cloud Run runtime)"
g iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 \
  || g iam service-accounts create cawg-viewer-deployer --display-name "CAWG viewer deployer (GitHub Actions)"

step "Deployer roles"
# run.admin, not run.developer: --allow-unauthenticated sets the service's IAM policy.
g projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/run.admin --condition None >/dev/null
g artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/artifactregistry.writer >/dev/null
g iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null

step "Workload Identity Federation (only $REPO may use it)"
g iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 \
  || g iam workload-identity-pools create "$POOL" --location global --display-name "GitHub Actions"
g iam workload-identity-pools providers describe "$PROVIDER" --location global \
    --workload-identity-pool "$POOL" >/dev/null 2>&1 \
  || g iam workload-identity-pools providers create-oidc "$PROVIDER" --location global \
       --workload-identity-pool "$POOL" --display-name "GitHub" \
       --issuer-uri "https://token.actions.githubusercontent.com" \
       --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
       --attribute-condition "assertion.repository == '$REPO'"
PRINCIPAL="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO"
g iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --member "$PRINCIPAL" --role roles/iam.workloadIdentityUser >/dev/null
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"

step "GitHub repository variables on $REPO"
gh variable set GCP_PROJECT_ID --repo "$REPO" --body "$PROJECT_ID"
gh variable set GCP_REGION --repo "$REPO" --body "$REGION"
gh variable set WIF_PROVIDER --repo "$REPO" --body "$WIF_PROVIDER"
gh variable set WIF_SERVICE_ACCOUNT --repo "$REPO" --body "$DEPLOY_SA"

step "Done"
echo "WIF_PROVIDER=$WIF_PROVIDER"
echo "WIF_SERVICE_ACCOUNT=$DEPLOY_SA"
echo "Push to main (or run the Deploy workflow) to deploy."
