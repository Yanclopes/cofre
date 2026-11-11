import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Marca uma rota como pública (sem token). Todo o resto exige autenticação. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
