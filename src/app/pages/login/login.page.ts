import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonInput,
  IonItem,
  IonLabel,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonSpinner,
  IonText,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logIn, personAdd, eye, eyeOff } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonInput,
    IonItem,
    IonLabel,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonSpinner,
    IonText,
    IonIcon
  ]
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  registerForm: FormGroup;
  isLoginMode = true;
  isLoading = false;
  showPassword = false;
  showRegisterPassword = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    addIcons({ logIn, personAdd, eye, eyeOff });
    
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(1)]],
      lastName: ['', [Validators.required, Validators.minLength(1)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    // Check if already authenticated
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/tabs/tab1']);
    }
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.loginForm.reset();
    this.registerForm.reset();
  }

  async onLogin() {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.signIn(email, password);
      this.router.navigate(['/tabs/tab1']);
    } catch (error: any) {
      this.errorMessage = error.message || 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.';
    } finally {
      this.isLoading = false;
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) {
      this.markFormGroupTouched(this.registerForm);
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { firstName, lastName, email, password } = this.registerForm.value;
      await this.authService.signUp(email, password, firstName, lastName);
      this.router.navigate(['/tabs/tab1']);
    } catch (error: any) {
      console.error('Registration error:', error);
      // Show more detailed error message
      if (error.message) {
        this.errorMessage = error.message;
      } else if (error.error_description) {
        this.errorMessage = error.error_description;
      } else if (typeof error === 'string') {
        this.errorMessage = error;
      } else {
        this.errorMessage = 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleRegisterPasswordVisibility() {
    this.showRegisterPassword = !this.showRegisterPassword;
  }
}

