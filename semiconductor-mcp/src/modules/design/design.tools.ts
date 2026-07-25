import { Injectable } from '@nitrostack/core';
import { DesignService } from './design.service.js';

@Injectable({ deps: [DesignService] })
export class DesignTools {
    constructor(private readonly designService: DesignService) { }
}
