import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { RequireTier } from '../billing/decorators/require-tier.decorator';
import { SubscriptionTierGuard } from '../billing/guards/subscription-tier.guard';

import { BacktestExplanationService } from './backtest-explanation.service';
import { BacktestService } from './backtest.service';
import { ExplainBacktestDto } from './dto/explain-backtest.dto';

@Controller('backtest')
@UseGuards(AuthGuard, SubscriptionTierGuard)
@RequireTier('pro')
export class BacktestController {
  constructor(
    private readonly backtestService: BacktestService,
    private readonly explanationService: BacktestExplanationService,
  ) {}

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

  @Post('explain')
  async explainBacktest(
    @Body() dto: ExplainBacktestDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const stream = this.explanationService.streamExplanation(dto);

      for await (const text of stream) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate explanation';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
}
