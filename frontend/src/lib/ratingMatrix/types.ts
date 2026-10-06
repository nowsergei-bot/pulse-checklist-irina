/** Ответ на матрицу оценок: ключ строки или столбца → выбранное значение. */
export type RatingMatrixAnswers = Record<string, string>;

export type RatingMatrixSelectAxis = 'row' | 'column';

export type RatingMatrixRow = {
  key: string;
  label: string;
  group?: string;
};

export type RatingMatrixColumn = {
  key: string;
  label: string;
  /** Если задано — в столбце можно выбрать только эти строки (key или label). */
  allowedRowKeys?: string[];
};

export type RatingMatrixColumnInput =
  | string
  | {
      key?: string;
      label?: string;
      allowedRows?: string[];
    };

export type RatingMatrixOptions = {
  rows?: RatingMatrixRow[];
  columns?: RatingMatrixColumnInput[];
  helpText?: string;
  sectionNumber?: number;
  sectionTitle?: string;
  /** row (по умолчанию): один выбор на строку. column: один выбор на столбец. */
  selectAxis?: RatingMatrixSelectAxis;
  /** Разрешить незаполненные строки/столбцы (отметить только часть предметов). */
  allowPartial?: boolean;
  cornerLabel?: string;
  hideRowKeys?: boolean;
};
