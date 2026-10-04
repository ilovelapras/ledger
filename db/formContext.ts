import type { FormContext } from '../domain/txForm';
import { listAccounts, requireAccountByCode } from './accounts';
import type { Db } from './client';
import { SYSTEM_CODES } from './seed';
import { getSettings } from './settings';

/** Everything `formToEntries` needs to turn entry-form values into balanced lines. */
export function buildFormContext(db: Db): FormContext {
  return {
    baseCurrency: getSettings(db).baseCurrency,
    accounts: new Map(listAccounts(db, true).map((a) => [a.id, a])),
    fxGain: requireAccountByCode(db, SYSTEM_CODES.fxGain),
    fxLoss: requireAccountByCode(db, SYSTEM_CODES.fxLoss),
    bankCharges: requireAccountByCode(db, SYSTEM_CODES.bankCharges),
  };
}
