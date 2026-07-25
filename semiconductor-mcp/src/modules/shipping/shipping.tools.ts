import { Injectable } from '@nitrostack/core';
import { ShippingTradeService } from './shipping.service.js';

@Injectable({ deps: [ShippingTradeService] })
export class ShippingTradeTools {
    constructor(private readonly shippingTradeService: ShippingTradeService) { }
}
