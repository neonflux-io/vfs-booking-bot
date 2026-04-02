import { Router, Request, Response } from 'express';
import {
  getSourceCountries,
  getDestinationCountries,
  getCentres,
  getVisaTypes,
} from '@config/vfs-countries';

const router = Router();

/**
 * GET /api/vfs-config
 * Returns all source countries, destination countries.
 * Optional query: ?source=gbr → also returns centres for that source.
 * Optional query: ?dest=prt   → also returns visa types for that destination.
 */
router.get('/', (_req: Request, res: Response) => {
  const source = (_req.query.source as string) ?? '';
  const dest =   (_req.query.dest as string) ?? '';

  res.json({
    sourceCountries: getSourceCountries(),
    destinationCountries: getDestinationCountries(),
    centres: source ? getCentres(source) : [],
    visaTypes: dest ? getVisaTypes(dest) : [],
  });
});

/**
 * GET /api/vfs-config/centres/:sourceCode
 * Returns application centres for a given source country.
 */
router.get('/centres/:sourceCode', (req: Request, res: Response) => {
  res.json(getCentres(req.params.sourceCode));
});

/**
 * GET /api/vfs-config/visa-types/:destCode
 * Returns visa types for a given destination country.
 */
router.get('/visa-types/:destCode', (req: Request, res: Response) => {
  res.json(getVisaTypes(req.params.destCode));
});

export default router;
