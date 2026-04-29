# MDM Release Distribution Verification
Date: 2026-04-30
Author: m1hono
Scope: `mdm-sources` release tag, MCP `@mcpskill/resource-registry`

## Result
`mdm-sources` now has a remote `main` branch and the first resource release tag:

- Repository: `https://github.com/PickAID/mdm-sources.git`
- Branch pushed: `main`
- Tag pushed: `mdm-resources-v0.1.0`
- Tagged commit: `ccfe2dc feat: publish mdm resource release artifacts`

The local release artifacts remain ignored in `release-out/`, while GitHub Release workflow is responsible for uploading them as release assets.

MCP now has a Release manifest reader in `@mcpskill/resource-registry`:

- reads local `mdm-release-manifest.json`
- fetches remote manifest through an injected fetcher
- resolves sibling artifact URLs from a manifest URL
- converts release manifests into the existing resource registry shape for status summarization

`mc_develop` does not automatically fetch remote release assets in this slice, preserving the current read-only/no-open-world public tool behavior.

## Remote Push Output
Command:

```bash
git push -u origin main
```

Output:

```text
To https://github.com/PickAID/mdm-sources.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

Command:

```bash
git push origin mdm-resources-v0.1.0
```

Output:

```text
To https://github.com/PickAID/mdm-sources.git
 * [new tag]         mdm-resources-v0.1.0 -> mdm-resources-v0.1.0
```

## Tag Verification
Command:

```bash
git ls-remote --tags origin 'refs/tags/mdm-resources-v0.1.0*'
```

Output:

```text
2089877886edb4a96d42eedee0b49f48dfc055ed	refs/tags/mdm-resources-v0.1.0
ccfe2dccfd405aced83325e0047e95498f3bd330	refs/tags/mdm-resources-v0.1.0^{}
```

## Local Release Artifact Listing
Command:

```bash
ls -l release-out && shasum -a 256 release-out/*
```

Output:

```text
total 16
-rw-r--r--@ 1 gedwen  staff  1201 Apr 29 13:06 core-docs-required-0.1.0.mdm-resource.json
-rw-r--r--@ 1 gedwen  staff   480 Apr 29 13:06 mdm-release-manifest.json
613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477  release-out/core-docs-required-0.1.0.mdm-resource.json
5db106c6387b1051f8d9bc79df64227fbbe7ab257934627c73a0dbbe8b93288f  release-out/mdm-release-manifest.json
```

## MCP Package Verification
Command:

```bash
pnpm --filter @mcpskill/resource-registry test
```

Output summary:

```text
Test Files  4 passed (4)
Tests  12 passed (12)
```

Command:

```bash
pnpm exec tsc -b packages/resource-registry --pretty false
```

Output: no output; TypeScript build passed.

## Real Manifest Read Sample
Input:

```text
/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources/release-out/mdm-release-manifest.json
```

Output excerpt:

```json
{
  "source": "/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources/release-out/mdm-release-manifest.json",
  "packageCount": 1,
  "firstPackage": {
    "packageId": "core-docs-required",
    "version": "0.1.0",
    "namespace": "core",
    "artifactType": "docs",
    "variant": "required",
    "required": true,
    "format": "json",
    "artifactName": "core-docs-required-0.1.0.mdm-resource.json",
    "sha256": "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
    "sizeBytes": 1201
  },
  "artifactUrlFromReleaseUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json"
}
```

## Limitation
The local machine does not have `gh` installed. The repository appears private to unauthenticated GitHub API calls, so workflow/release status could not be queried from this shell. The tag push should trigger `.github/workflows/release.yml`; verify the GitHub Actions run in the browser or install/authenticate `gh` before relying on the remote Release assets.
