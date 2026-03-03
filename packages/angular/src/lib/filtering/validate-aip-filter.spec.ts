import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { FormField, form } from "@angular/forms/signals";
import { ident, STRING } from "@protoutil/aip/filtering";
import { beforeEach, describe, expect, it } from "vitest";
import { validateAipFilter } from "./validate-aip-filter";

const testDeclarations = [ident("name", STRING)];

describe("aip filter validator", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [ReactiveFormsModule, FormField],
    });
  });

  it("has no errors with no value with no declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal("");
      readonly f = form(this.s, (path) => {
        validateAipFilter(path);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(0);
  });

  it("has errors with invalid filter with no declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal("invalid filter");
      readonly f = form(this.s, (path) => {
        validateAipFilter(path);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(1);
    expect(f().errors()[0].kind).toEqual("invalidFilter");
  });

  it("has no errors with valid filter with no declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal("'abc' = '123'");
      readonly f = form(this.s, (path) => {
        validateAipFilter(path);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(0);
  });

  it("has no errors with empty filter with declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal("");
      readonly f = form(this.s, (path) => {
        validateAipFilter(path, () => testDeclarations);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(0);
  });

  it("has errors with invalid filter with declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal('abc = "test"');
      readonly f = form(this.s, (path) => {
        validateAipFilter(path, () => testDeclarations);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(1);
    expect(f().errors()[0].kind).toEqual("invalidFilter");
  });

  it("has no errors with valid filter with declarations", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal('name = "test"');
      readonly f = form(this.s, (path) => {
        validateAipFilter(path, () => testDeclarations);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(0);
  });

  it("updates the validation with user input", () => {
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f" />`,
    })
    class TestCmp {
      readonly s = signal("");
      readonly f = form(this.s, (path) => {
        validateAipFilter(path, () => testDeclarations);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errors().length).toEqual(0);
    fixture.componentInstance.s.set('abc = "test"');
    fixture.detectChanges();
    expect(f().errors().length).toEqual(1);
    expect(f().errors()[0].kind).toEqual("invalidFilter");
    fixture.componentInstance.s.set('name = "test"');
    fixture.detectChanges();
    expect(f().errors().length).toEqual(0);
  });
});
