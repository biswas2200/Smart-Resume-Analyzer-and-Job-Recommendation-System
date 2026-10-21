package com.resumeanalyser.account.dto;

/**
 * Public, account-independent tier facts for the UI.
 *
 * @param previewMode true while Premium is waived for everyone (the 0.x
 *                    preview); the UI then shows the preview banner and no
 *                    upgrade prompts
 */
public record TierInfoDto(boolean previewMode) {}
