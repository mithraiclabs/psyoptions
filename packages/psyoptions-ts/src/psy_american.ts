export type PsyAmerican = {
  "version": "0.2.6",
  "name": "psy_american",
  "instructions": [
    {
      "name": "initializeMarket",
      "accounts": [
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "quoteAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "underlyingAmountPerContract",
          "type": "u64"
        },
        {
          "name": "quoteAmountPerContract",
          "type": "u64"
        },
        {
          "name": "expirationUnixTimestamp",
          "type": "i64"
        },
        {
          "name": "bumpSeed",
          "type": "u8"
        }
      ]
    },
    {
      "name": "mintOption",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedOptionDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedWriterTokenDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintOptionV2",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedOptionDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedWriterTokenDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "exerciseOption",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "exerciserOptionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "exerciseOptionV2",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "exerciserOptionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closePostExpiration",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeOptionPosition",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "burnWriterForQuote",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerQuoteDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initSerumMarket",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "pcMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "requestQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "eventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "asks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "marketAuthority",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "marketSpace",
          "type": "u64"
        },
        {
          "name": "vaultSignerNonce",
          "type": "u64"
        },
        {
          "name": "coinLotSize",
          "type": "u64"
        },
        {
          "name": "pcLotSize",
          "type": "u64"
        },
        {
          "name": "pcDustThreshold",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "optionMarket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "optionMint",
            "type": "publicKey"
          },
          {
            "name": "writerTokenMint",
            "type": "publicKey"
          },
          {
            "name": "underlyingAssetMint",
            "type": "publicKey"
          },
          {
            "name": "quoteAssetMint",
            "type": "publicKey"
          },
          {
            "name": "underlyingAmountPerContract",
            "type": "u64"
          },
          {
            "name": "quoteAmountPerContract",
            "type": "u64"
          },
          {
            "name": "expirationUnixTimestamp",
            "type": "i64"
          },
          {
            "name": "underlyingAssetPool",
            "type": "publicKey"
          },
          {
            "name": "quoteAssetPool",
            "type": "publicKey"
          },
          {
            "name": "mintFeeAccount",
            "type": "publicKey"
          },
          {
            "name": "exerciseFeeAccount",
            "type": "publicKey"
          },
          {
            "name": "expired",
            "type": "bool"
          },
          {
            "name": "bumpSeed",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ErrorCode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "ExpirationIsInThePast"
          },
          {
            "name": "QuoteAndUnderlyingAssetMustDiffer"
          },
          {
            "name": "QuoteOrUnderlyingAmountCannotBe0"
          },
          {
            "name": "OptionMarketMustBeMintAuthority"
          },
          {
            "name": "OptionMarketMustOwnUnderlyingAssetPool"
          },
          {
            "name": "OptionMarketMustOwnQuoteAssetPool"
          },
          {
            "name": "ExpectedSPLTokenProgramId"
          },
          {
            "name": "MintFeeMustBeOwnedByFeeOwner"
          },
          {
            "name": "ExerciseFeeMustBeOwnedByFeeOwner"
          },
          {
            "name": "MintFeeTokenMustMatchUnderlyingAsset"
          },
          {
            "name": "ExerciseFeeTokenMustMatchQuoteAsset"
          },
          {
            "name": "OptionMarketExpiredCantMint"
          },
          {
            "name": "UnderlyingPoolAccountDoesNotMatchMarket"
          },
          {
            "name": "OptionTokenMintDoesNotMatchMarket"
          },
          {
            "name": "WriterTokenMintDoesNotMatchMarket"
          },
          {
            "name": "MintFeeKeyDoesNotMatchOptionMarket"
          },
          {
            "name": "SizeCantBeLessThanEqZero"
          },
          {
            "name": "ExerciseFeeKeyDoesNotMatchOptionMarket"
          },
          {
            "name": "QuotePoolAccountDoesNotMatchMarket"
          },
          {
            "name": "UnderlyingDestMintDoesNotMatchUnderlyingAsset"
          },
          {
            "name": "FeeOwnerDoesNotMatchProgram"
          },
          {
            "name": "OptionMarketExpiredCantExercise"
          },
          {
            "name": "OptionMarketNotExpiredCantClose"
          },
          {
            "name": "NotEnoughQuoteAssetsInPool"
          },
          {
            "name": "InvalidAuth"
          },
          {
            "name": "CoinMintIsNotOptionMint"
          },
          {
            "name": "CannotPruneActiveMarket"
          },
          {
            "name": "NumberOverflow"
          }
        ]
      }
    }
  ]
};

export const IDL: PsyAmerican = {
  "version": "0.2.6",
  "name": "psy_american",
  "instructions": [
    {
      "name": "initializeMarket",
      "accounts": [
        {
          "name": "authority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "quoteAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "underlyingAmountPerContract",
          "type": "u64"
        },
        {
          "name": "quoteAmountPerContract",
          "type": "u64"
        },
        {
          "name": "expirationUnixTimestamp",
          "type": "i64"
        },
        {
          "name": "bumpSeed",
          "type": "u8"
        }
      ]
    },
    {
      "name": "mintOption",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedOptionDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedWriterTokenDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintOptionV2",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "underlyingAssetMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedOptionDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mintedWriterTokenDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "exerciseOption",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "exerciserOptionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeOwner",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "exerciseOptionV2",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "exerciserOptionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closePostExpiration",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closeOptionPosition",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "optionTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "underlyingAssetDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "burnWriterForQuote",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "writerTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerTokenSrc",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "quoteAssetPool",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "writerQuoteDest",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initSerumMarket",
      "accounts": [
        {
          "name": "userAuthority",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "optionMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "pcMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "optionMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "requestQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "eventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "asks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "marketAuthority",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "marketSpace",
          "type": "u64"
        },
        {
          "name": "vaultSignerNonce",
          "type": "u64"
        },
        {
          "name": "coinLotSize",
          "type": "u64"
        },
        {
          "name": "pcLotSize",
          "type": "u64"
        },
        {
          "name": "pcDustThreshold",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "optionMarket",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "optionMint",
            "type": "publicKey"
          },
          {
            "name": "writerTokenMint",
            "type": "publicKey"
          },
          {
            "name": "underlyingAssetMint",
            "type": "publicKey"
          },
          {
            "name": "quoteAssetMint",
            "type": "publicKey"
          },
          {
            "name": "underlyingAmountPerContract",
            "type": "u64"
          },
          {
            "name": "quoteAmountPerContract",
            "type": "u64"
          },
          {
            "name": "expirationUnixTimestamp",
            "type": "i64"
          },
          {
            "name": "underlyingAssetPool",
            "type": "publicKey"
          },
          {
            "name": "quoteAssetPool",
            "type": "publicKey"
          },
          {
            "name": "mintFeeAccount",
            "type": "publicKey"
          },
          {
            "name": "exerciseFeeAccount",
            "type": "publicKey"
          },
          {
            "name": "expired",
            "type": "bool"
          },
          {
            "name": "bumpSeed",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ErrorCode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "ExpirationIsInThePast"
          },
          {
            "name": "QuoteAndUnderlyingAssetMustDiffer"
          },
          {
            "name": "QuoteOrUnderlyingAmountCannotBe0"
          },
          {
            "name": "OptionMarketMustBeMintAuthority"
          },
          {
            "name": "OptionMarketMustOwnUnderlyingAssetPool"
          },
          {
            "name": "OptionMarketMustOwnQuoteAssetPool"
          },
          {
            "name": "ExpectedSPLTokenProgramId"
          },
          {
            "name": "MintFeeMustBeOwnedByFeeOwner"
          },
          {
            "name": "ExerciseFeeMustBeOwnedByFeeOwner"
          },
          {
            "name": "MintFeeTokenMustMatchUnderlyingAsset"
          },
          {
            "name": "ExerciseFeeTokenMustMatchQuoteAsset"
          },
          {
            "name": "OptionMarketExpiredCantMint"
          },
          {
            "name": "UnderlyingPoolAccountDoesNotMatchMarket"
          },
          {
            "name": "OptionTokenMintDoesNotMatchMarket"
          },
          {
            "name": "WriterTokenMintDoesNotMatchMarket"
          },
          {
            "name": "MintFeeKeyDoesNotMatchOptionMarket"
          },
          {
            "name": "SizeCantBeLessThanEqZero"
          },
          {
            "name": "ExerciseFeeKeyDoesNotMatchOptionMarket"
          },
          {
            "name": "QuotePoolAccountDoesNotMatchMarket"
          },
          {
            "name": "UnderlyingDestMintDoesNotMatchUnderlyingAsset"
          },
          {
            "name": "FeeOwnerDoesNotMatchProgram"
          },
          {
            "name": "OptionMarketExpiredCantExercise"
          },
          {
            "name": "OptionMarketNotExpiredCantClose"
          },
          {
            "name": "NotEnoughQuoteAssetsInPool"
          },
          {
            "name": "InvalidAuth"
          },
          {
            "name": "CoinMintIsNotOptionMint"
          },
          {
            "name": "CannotPruneActiveMarket"
          },
          {
            "name": "NumberOverflow"
          }
        ]
      }
    }
  ]
};
