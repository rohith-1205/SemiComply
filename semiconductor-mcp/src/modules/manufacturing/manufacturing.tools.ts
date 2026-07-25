import { Injectable } from '@nitrostack/core';
import { ManufacturingMESService } from './manufacturing.service.js';

@Injectable({ deps: [ManufacturingMESService] })
export class ManufacturingMESTools {
    constructor(private readonly manufacturingMESService: ManufacturingMESService) { }
}
