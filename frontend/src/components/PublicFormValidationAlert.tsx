import { motion } from 'framer-motion';
import type { PublicFormMissingField } from '../lib/publicFormValidation';

export default function PublicFormValidationAlert({ missing }: { missing: PublicFormMissingField[] }) {
  if (!missing.length) return null;

  return (
    <motion.div
      className="public-form-validation-alert"
      role="alert"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
    >
      <p className="err public-form-validation-alert__title">Не заполнено:</p>
      <ul className="public-form-validation-list">
        {missing.map((m) => (
          <li key={m.id}>{m.label}</li>
        ))}
      </ul>
    </motion.div>
  );
}
