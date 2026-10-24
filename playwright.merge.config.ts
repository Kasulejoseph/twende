import { defineConfig } from '@playwright/test';
import type { GitHubActionOptions } from '@estruyf/github-actions-reporter';

const githubReporter: GitHubActionOptions = {
  title: 'Twende API tests',
  useDetails: true,
  showAnnotations: true,
  showTags: true,
  showError: true,
  errorFormat: 'short',
  showFailedOverview: true,
  workflowAnnotations: true,
  showArtifactsLink: true,
  prComment: true,
};

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['html', { open: 'never' }],
    ['@estruyf/github-actions-reporter', githubReporter],
  ],
});
