# GitHub App setup (V1)

GBF V1 authenticates to GitHub as a GitHub App installation. The app is read-only and should initially be installed on **one repository only: `bohanyt/arti-dev`**.

Do not paste the private key into chat, an issue, a commit, or a `.env` file that may be committed.

## 1. Register the app

Open GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**.

Suggested values:

- **GitHub App name:** `Bohan GitHub But Fast` (or another available name)
- **Homepage URL:** `https://github.com/bohanyt/github-but-fast`
- **Callback URL / user authorization:** not needed for V1
- **Setup URL:** blank
- **Webhook:** **deselect Active**
- **Where can this GitHub App be installed?** **Only on this account**

V1 does not consume webhooks. Leaving them disabled removes an unnecessary ingress path and webhook secret.

## 2. Repository permissions

Use the minimum read-only permissions required for the ARTI benchmark:

| Permission | V1 |
| --- | --- |
| Metadata | Read-only (GitHub-required baseline) |
| Contents | Read-only |
| Issues | Read-only |
| Pull requests | Read-only |
| Actions | Read-only |
| Checks | Read-only |
| Commit statuses | Read-only |

Leave other repository, organization, account, and user permissions at **No access** unless a concrete read endpoint later proves it is required.

No V1 permission should be `Read & write`.

## 3. Create the app and generate a private key

After creating the app:

1. record the numeric **App ID**;
2. generate a new **private key** from the app settings;
3. keep the downloaded PEM file local until it is entered directly into Cloudflare Secrets.

The App ID is not itself a secret. The private key is.

## 4. Install the app

Select **Install App** and choose the `bohanyt` account.

Choose:

**Only select repositories → `bohanyt/arti-dev`**

Do not select **All repositories** for the first staging run.

After installation, record the numeric **Installation ID**. It is visible in the installation/settings URL and can also be retrieved through GitHub's installation API.

## 5. Values needed by GBF

You will have:

```text
GITHUB_APP_ID=<numeric app id>
GITHUB_INSTALLATION_ID=<numeric installation id>
GITHUB_PRIVATE_KEY=<full PEM private key>
GITHUB_ALLOWED_REPOS=bohanyt/arti-dev
```

Only `GITHUB_PRIVATE_KEY` must be treated as a strong secret here. GBF still keeps the other configuration server-side.

## 6. Later multi-repo rollout

After ARTI staging is proven, the same App installation can be updated to add selected repositories such as other Bohan projects. Update `GITHUB_ALLOWED_REPOS` at the same time.

Adding a repository to the GitHub App does **not** automatically bypass GBF's own allowlist; both layers must permit it.

## Sources

- GitHub: Registering a GitHub App — https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- GitHub: Installing a GitHub App — https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party
