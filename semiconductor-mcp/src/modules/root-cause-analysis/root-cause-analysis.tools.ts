import { Injectable } from '@nitrostack/core';
import { RootCauseAnalysisService } from './root-cause-analysis.service.js';

@Injectable({ deps: [RootCauseAnalysisService] })
export class RootCauseAnalysisTools {
    constructor(private readonly rootCauseAnalysisService: RootCauseAnalysisService) { }
}
