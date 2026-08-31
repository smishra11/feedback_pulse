import type { Brand, Wave } from "@prisma/client";

import { EMPTY_SUMMARY, type Summary } from "@/lib/nps";
import { prisma } from "@/lib/prisma";
import { ResponseService } from "@/services/response.service";

export type BrandWithStats = Brand & {
  waveCount: number;
  latestWave: Wave | null;
  summary: Summary;
  customerCount: number;
  activeCustomers: number;
};

export class BrandService {
  static async list(): Promise<Brand[]> {
    return prisma.brand.findMany({ orderBy: { name: "asc" } });
  }

  static async getBySlug(slug: string): Promise<Brand | null> {
    return prisma.brand.findUnique({ where: { slug } });
  }

  /**
   * Brand list with the headline number for each brand's most recent wave.
   */
  static async listWithStats(): Promise<BrandWithStats[]> {
    const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });
    const results: BrandWithStats[] = [];

    for (const brand of brands) {
      const waves = await prisma.wave.findMany({
        where: { brandId: brand.id },
        orderBy: { startDate: "desc" },
      });

      const latestWave = waves[0] ?? null;
      const summary = latestWave
        ? await ResponseService.getSummary(latestWave)
        : EMPTY_SUMMARY;

      // Get the total number of customers in a single query
      const customerCount = await prisma.customer.count({
        where: { brandId: brand.id },
      });

      // Find how many unique customers have ever given feedback
      const activeCustomersResult = await prisma.response.findMany({
        where: {
          customer: { brandId: brand.id },
        },
        distinct: ["customerId"],
        select: { customerId: true },
      });
      const activeCustomers = activeCustomersResult.length;

      results.push({
        ...brand,
        waveCount: waves.length,
        latestWave,
        summary,
        customerCount,
        activeCustomers,
      });
    }

    return results;
  }
}
