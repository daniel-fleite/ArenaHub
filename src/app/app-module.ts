import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Navbar } from './navbar/navbar';
import { Hero } from './hero/hero';
import { Modalidades } from './modalidades/modalidades';
import { Funcionalidades } from './funcionalidades/funcionalidades';
import { Beneficios } from './beneficios/beneficios';
import { Atletas } from './atletas/atletas';
import { NgbCarouselModule, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { Depoimentos } from './depoimentos/depoimentos';
import { Cta } from './cta/cta';
import { Footer } from './footer/footer';

@NgModule({
  declarations: [
    App,
    Navbar,
    Hero,
    Modalidades,
    Funcionalidades,
    Beneficios,
    Atletas,
    Depoimentos,
    Cta,
    Footer,
  ],
  imports: [BrowserModule, AppRoutingModule, NgbModule, NgbCarouselModule],
  providers: [provideBrowserGlobalErrorListeners()],
  bootstrap: [App],
})
export class AppModule {}
