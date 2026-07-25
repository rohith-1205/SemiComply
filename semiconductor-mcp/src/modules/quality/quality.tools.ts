import { Injectable } from '@nitrostack/core';
import { QualityTestService } from './quality.service.js';

@Injectable({ deps: [QualityTestService] })
export class QualityTestTools {
    constructor(private readonly qualityTestService: QualityTestService) { }
}
