#!/usr/bin/env bash

cd "$(dirname "$0")"

for dir in ../programs/*/
do
    program_path=${dir%*/}
    program_name=${program_path##*/}
    echo "cleaning $program_name..."
    cd "$program_path"
    cargo clean
    cd -
done
