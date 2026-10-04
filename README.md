# Small Stores AI Platform

A B2B platform that gives solo store owners selling on **Instagram** and **Facebook Pages**
an AI agent that answers customer DMs for them.

## Scope (v0)

The agent can, for a connected store:

- receive customer DMs from Instagram and Facebook Page inbox
- check product stock (by product / variant) and prices
- answer customers using only the store's own catalog data
- hand the conversation to the owner when it cannot help

Out of scope for v0: taking payments, creating orders, comment replies, other channels.

## Docs

- [Architecture](docs/architecture.md)
- [Data model](supabase/migrations/0001_init.sql)

## Stack

TypeScript · Supabase (Postgres, Auth, RLS) · Meta Graph API webhooks · Claude (tool use)

## Setup

```sh
cp .env.example .env   # fill in values
```
