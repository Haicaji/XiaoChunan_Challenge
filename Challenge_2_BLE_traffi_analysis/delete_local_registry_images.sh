#!/usr/bin/env bash
set -euo pipefail

# Docker image repository prefix to remove.
# Override example:
#   REGISTRY_PREFIX="127.0.0.1:5000/" ./delete_local_registry_images.sh
REGISTRY_PREFIX="${REGISTRY_PREFIX:-127.0.0.1:5000/}"

# Set DRY_RUN=1 to preview the commands without deleting images.
DRY_RUN="${DRY_RUN:-0}"

# Set REMOVE_STOPPED_CONTAINERS=0 if you want to preserve stopped containers.
# Running containers are never removed by this script.
REMOVE_STOPPED_CONTAINERS="${REMOVE_STOPPED_CONTAINERS:-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found" >&2
  exit 1
fi

mapfile -t images < <(
  docker image ls --format '{{.Repository}}:{{.Tag}}' |
    awk -v prefix="$REGISTRY_PREFIX" '
      $0 !~ /<none>/ && index($0, prefix) == 1 { print }
    '
)

if [ "${#images[@]}" -eq 0 ]; then
  echo "No images found with prefix: ${REGISTRY_PREFIX}"
  exit 0
fi

echo "Images to remove:"
printf '  %s\n' "${images[@]}"

failed=0

for image in "${images[@]}"; do
  mapfile -t all_containers < <(docker container ls -aq --filter "ancestor=${image}")
  mapfile -t running_containers < <(docker container ls -q --filter "ancestor=${image}")
  stopped_containers=()

  for container in "${all_containers[@]}"; do
    is_running=0
    for running in "${running_containers[@]}"; do
      if [ "$container" = "$running" ]; then
        is_running=1
        break
      fi
    done

    if [ "$is_running" = "0" ]; then
      stopped_containers+=("$container")
    fi
  done

  if [ "${#stopped_containers[@]}" -gt 0 ]; then
    echo "Stopped containers using ${image}:"
    printf '  %s\n' "${stopped_containers[@]}"

    if [ "$REMOVE_STOPPED_CONTAINERS" = "1" ]; then
      if [ "$DRY_RUN" = "1" ]; then
        echo "DRY_RUN: docker container rm ${stopped_containers[*]}"
      else
        docker container rm "${stopped_containers[@]}" || failed=1
      fi
    else
      echo "Skip image because stopped containers still reference it: ${image}"
      failed=1
      continue
    fi
  fi

  if [ "${#running_containers[@]}" -gt 0 ]; then
    echo "Skip image because running containers still reference it: ${image}"
    printf '  %s\n' "${running_containers[@]}"
    failed=1
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY_RUN: docker image rm ${image}"
  else
    docker image rm "$image" || failed=1
  fi
done

exit "$failed"
