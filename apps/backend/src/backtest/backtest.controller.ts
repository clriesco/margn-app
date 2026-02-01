import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';

import { BacktestService } from './backtest.service';

@Controller('backtest')
@UseGuards(AuthGuard)
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Get('prices')
  async getPrices(
    @Query('symbols') symbolsStr: string,
    @Query('from') from: string,
    @Query('to') to: string
  ) {
    if (!symbolsStr || !from || !to) {
      throw new HttpException(
        'Missing required parameters: symbols, from, to',
        HttpStatus.BAD_REQUEST
      );
    }

    const symbols = symbolsStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (symbols.length === 0) {
      throw new HttpException('No valid symbols provided', HttpStatus.BAD_REQUEST);
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }
    if (fromDate >= toDate) {
      throw new HttpException('from must be before to', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.backtestService.getPrices(symbols, from, to);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to fetch prices',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
