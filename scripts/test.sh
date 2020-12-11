#!/usr/bin/env bash

cd "$(dirname "$0")"

if [ "$1" ]; then
  program_name=$1
  echo "Testing ${program_name}..."

  cargo test --features program --manifest-path "../programs/${program_name}/Cargo.toml"
else
  for dir in ../programs/*/
  do
    program_path=${dir%*/}
    program_name=${program_path##*/}

  echo "Testing ${program_name}..."

  cargo test --features program --manifest-path "${program_path}/Cargo.toml"

  echo "End testing of ${program_name}"
  done
fi
