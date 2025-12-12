import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function containsLetterValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }
    
    const value = control.value.toString().trim();
    
    if (value.length === 0) {
      return null;
    }
    
    const hasLetter = /[a-zA-ZäöüÄÖÜß]/.test(value);
    
    if (!hasLetter) {
      return { containsLetter: { value: control.value } };
    }
    
    return null;
  };
}
export function lettersOnlyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null;
    }

    const value = control.value.toString().trim();
    if (value.length === 0) {
      return null;
    }

    const lettersOnlyRegex = /^[A-Za-zÄÖÜäöüß\s-]+$/;
    if (!lettersOnlyRegex.test(value)) {
      return { lettersOnly: { value: control.value } };
    }

    return null;
  };
}

