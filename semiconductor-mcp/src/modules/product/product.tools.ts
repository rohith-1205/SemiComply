import { Injectable } from '@nitrostack/core';
import { ProductDocService } from './product.service.js';

@Injectable({ deps: [ProductDocService] })
export class ProductDocTools {
    constructor(private readonly productDocService: ProductDocService) { }
}
