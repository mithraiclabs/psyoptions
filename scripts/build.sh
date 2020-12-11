#!/usr/bin/env bash

cd "$(dirname "$0")"

sdkDir=../node_modules/@solana/web3.js/bpf-sdk
profile=bpfel-unknown-unknown/release
# clean dist 
rm -rf ../dist
mkdir -p ../dist

for dir in ../programs/*/
do
    program_path=${dir%*/}
    program_name=${program_path##*/}

    targetDir="$program_path"/target
    so_path="$targetDir/$profile"
    so_name="solana_bpf_$program_name"

    #build using solana sdk
    "$sdkDir"/rust/build.sh "$program_path"

    if [ -f "$so_path/${so_name}.so" ]; then
        cp "$so_path/${so_name}.so" "$so_path/${so_name}_debug.so"
        "$sdkDir"/dependencies/llvm-native/bin/llvm-objcopy --strip-all "$so_path/${so_name}.so" "$so_path/$so_name.so"
    fi

    cp "$so_path/${so_name}.so" ../dist/"$program_name".so
done
