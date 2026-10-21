package com.resumeanalyser.account;

import com.resumeanalyser.account.dto.TierInfoDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tier facts the UI needs before (and after) sign-in -- public, so the
 * landing page can say "free during the preview" too.
 */
@RestController
@RequestMapping("/tiers")
public class TierController {

    private final TierProperties tiers;

    public TierController(TierProperties tiers) {
        this.tiers = tiers;
    }

    /** Whether preview mode is on (every account gets Premium). */
    @GetMapping
    public TierInfoDto info() {
        return new TierInfoDto(tiers.previewMode());
    }
}
