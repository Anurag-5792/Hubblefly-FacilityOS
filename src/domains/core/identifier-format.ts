import {
  ValidationError,
  precondition,
} from "../../platform/primitives";
import type { IdentifierPeriod, IdentifierSeries } from "./model";

const allowedTemplateLiteral = /^[A-Za-z0-9._/-]*$/;
const periodKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$/;
const periodTokenPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/;

function countToken(template: string, token: string): number {
  return template.split(token).length - 1;
}

export function validateIdentifierTemplate(input: {
  readonly formatTemplate: string;
  readonly sequenceWidth: number;
  readonly requiresPeriod: boolean;
}): void {
  precondition(
    Number.isSafeInteger(input.sequenceWidth) &&
      input.sequenceWidth >= 1 &&
      input.sequenceWidth <= 12,
    "Sequence width must be an integer between 1 and 12.",
  );

  precondition(
    input.formatTemplate.length >= 5 && input.formatTemplate.length <= 120,
    "Identifier format template must be 5-120 characters.",
  );

  precondition(
    countToken(input.formatTemplate, "{sequence}") === 1,
    "Identifier template must contain exactly one {sequence} token.",
  );

  const periodCount = countToken(input.formatTemplate, "{period}");
  if (input.requiresPeriod) {
    precondition(
      periodCount === 1,
      "Period-scoped identifier template must contain exactly one {period} token.",
    );
  } else {
    precondition(
      periodCount === 0,
      "Non-period identifier template must not contain a {period} token.",
    );
  }

  const stripped = input.formatTemplate
    .replace("{sequence}", "")
    .replace("{period}", "");
  precondition(
    allowedTemplateLiteral.test(stripped),
    "Identifier template contains unsupported literal characters.",
  );

  const leftoverToken = stripped.includes("{") || stripped.includes("}");
  precondition(!leftoverToken, "Identifier template contains an unsupported token.");
}

export function validateIdentifierPeriod(period: IdentifierPeriod): void {
  if (!periodKeyPattern.test(period.key)) {
    throw new ValidationError("Identifier period key has an invalid format.");
  }
  if (!periodTokenPattern.test(period.token)) {
    throw new ValidationError("Identifier period token has an invalid format.");
  }
}

export function formatIdentifier(
  series: Pick<
    IdentifierSeries,
    "formatTemplate" | "sequenceWidth" | "requiresPeriod"
  >,
  sequenceValue: number,
  period?: IdentifierPeriod,
): string {
  precondition(
    Number.isSafeInteger(sequenceValue) && sequenceValue > 0,
    "Sequence value must be a positive safe integer.",
  );

  validateIdentifierTemplate(series);

  if (series.requiresPeriod) {
    precondition(period !== undefined, "Identifier period is required.");
  } else {
    precondition(period === undefined, "Identifier period is not allowed for this series.");
  }

  if (period) validateIdentifierPeriod(period);

  const sequenceToken = String(sequenceValue).padStart(series.sequenceWidth, "0");
  return series.formatTemplate
    .replace("{sequence}", sequenceToken)
    .replace("{period}", period?.token ?? "");
}
