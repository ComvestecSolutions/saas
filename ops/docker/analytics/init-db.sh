#!/bin/sh
set -eu

clickhouse client -n <<'EOSQL'
CREATE DATABASE IF NOT EXISTS openpanel;
EOSQL