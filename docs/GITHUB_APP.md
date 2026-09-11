# GitHub App setup

GBF v0.2 authenticates to GitHub as a **read-only GitHub App installation**.

The App may be installed on several selected repositories, but GBF still requires every repository to be listed explicitly in `GITHUB_ALLOWED_REPOS`. Both layers must permit access.

Never paste the private key into chat, an issue, a commit, or any file that could be committed.

## 1. Register the app

Open GitHub:

**Settings → Developer settings → GitHub Apps → New GitHub App**

Suggested values:

- **GitHub App name:** `Bohan GitHub But Fast` (or another available name)
- **Homepage URL:** `https://github.com/bohanyt/github-but-fast`
- **Callback URL / user authorization:** not required for the stable bearer-auth GBF path
- **Setup URL:** blank
- **Webhook:** disabled
- **Where can this GitHub App be installed?** only the intended account unless you explicitly need broader installation

GBF does not consume GitHub webhooks. Leaving them disabled removes unnecessary ingress and webhook-secret management.

## 2. Repository permissions

Recommended minimum read-only repository permissions:

| Permission | Setting |
| --- | --- |
| Metadata | Read-only (GitHub-required baseline) |
| Contents | Read-only |
| Issues | Read-only |
| Pull requests | Read-only |
| Actions | Read-only |
| Checks | Read-only |
| Commit statuses | Read-only |

Leave other repository, organization, account, and user permissions at **No access** unless a concrete GBF read endpoint later proves one is required.

No stable v0.2 permission should be `Read & write`.

## 3. Generate and keep the private key local

After creating the app:

1. record the numeric **App ID**;
2. generate a **private key** from the GitHub App settings;
3. keep the downloaded PEM outside the repository;
4. point `GITHUB_PRIVATE_KEY_FILE` at that local file.

GitHub may issue an RSA private key in PKCS#1 form. GBF converts it in memory for signing when needed; the original file is not modified.

The App ID and Installation ID are configuration identifiers, not strong secrets. The private key is a strong secret.

## 4. Install the app

Select **Install App** and choose the intended account.

Prefer:

**Only select repositories**

Choose only repositories GBF should be able to read.

After installation, record the numeric **Installation ID** from the installation/settings URL or GitHub API.

## 5. GBF configuration

Example:

```env
GITHUB_APP_ID=<numeric app id>
GITHUB_INSTALLATION_ID=<numeric installation id>
GITHUB_PRIVATE_KEY_FILE=C:\path\to\github-app-private-key.pem
GITHUB_ALLOWED_REPOS=owner/repo-a,owner/repo-b
```

The App installation and GBF allowlist are independent checks:

```text
GitHub App installed on repo
        AND
repo is present in GITHUB_ALLOWED_REPOS
        => GBF may read it
```

Installing the App on a repository does **not** automatically expose it through GBF.

## 6. Add another project later

To add another project:

1. update the GitHub App installation to include the repository;
2. add `owner/repo` to `GITHUB_ALLOWED_REPOS`;
3. restart GBF;
4. run a read smoke against the new repo.

No source-code change should be necessary.

## Security principle

The GitHub App should remain read-only even though GBF also enforces read-only policy in host code. That gives defense in depth: a policy bug in one layer should still not grant repository mutation authority.

## Sources

- GitHub: Registering a GitHub App — https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- GitHub: Installing a GitHub App — https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party
