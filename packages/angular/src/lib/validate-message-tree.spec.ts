import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { FormField, form } from "@angular/forms/signals";
import { create } from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import { beforeEach, describe, expect, it } from "vitest";
import { PersonSchema } from "./gen/protovalidate-testing/tests/example/v1/example_pb";
import { validateMessageTree } from "./validate-message-tree";

describe("message tree validator", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      imports: [ReactiveFormsModule, FormField],
    });
  });

  it("has errors with no value set", () => {
    const validator = createValidator();
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f.name" />`,
    })
    class TestCmp {
      readonly m = create(PersonSchema);
      readonly s = signal(this.m);
      readonly f = form(this.s, (path) => {
        validateMessageTree(path, validator, PersonSchema);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errorSummary().length).toBeGreaterThan(0);
    expect(f.id().errors().length).toEqual(1);
    expect(f.id().errors()[0].kind).toEqual("uint64.gt");
    expect(f.name().errors().length).toEqual(1);
    expect(f.name().errors()[0].kind).toEqual("string.pattern");
    expect(f.email().errors().length).toEqual(1);
    expect(f.email().errors()[0].kind).toEqual("string.email_empty");
  });

  it("has no errors with valid value set", () => {
    const validator = createValidator();
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f.name" />`,
    })
    class TestCmp {
      readonly m = create(PersonSchema, {
        id: 1000n,
        name: "John Doe",
        email: "test@test.com",
      });
      readonly s = signal(this.m);
      readonly f = form(this.s, (path) => {
        validateMessageTree(path, validator, PersonSchema);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errorSummary().length).toEqual(0);
    expect(f.id().errors().length).toEqual(0);
    expect(f.name().errors().length).toEqual(0);
    expect(f.email().errors().length).toEqual(0);
  });

  it("should handle nested message", () => {
    const validator = createValidator();
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f.name" />`,
    })
    class TestCmp {
      readonly m = create(PersonSchema, {
        id: 1000n,
        name: "John Doe",
        email: "test@test.com",
        home: {
          lat: 100000,
          lng: 100000,
        },
      });
      readonly s = signal(this.m);
      readonly f = form(this.s, (path) => {
        validateMessageTree(path, validator, PersonSchema);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f().errorSummary().length).toBeGreaterThan(0);
    expect(f.home?.lat().errors().length).toEqual(1);
    expect(f.home?.lat().errors()[0].kind).toEqual("double.gte_lte");
    expect(f.home?.lng().errors().length).toEqual(1);
    expect(f.home?.lng().errors()[0].kind).toEqual("double.gte_lte");
  });

  it("should update with user input", () => {
    const validator = createValidator();
    @Component({
      standalone: true,
      imports: [ReactiveFormsModule, FormField],
      template: `<input [formField]="f.name" />`,
    })
    class TestCmp {
      readonly m = create(PersonSchema);
      readonly s = signal(this.m);
      readonly f = form(this.s, (path) => {
        validateMessageTree(path, validator, PersonSchema);
      });
    }
    const fixture = TestBed.createComponent(TestCmp);
    fixture.detectChanges();
    const f = fixture.componentInstance.f;
    expect(f.name().errors().length).toEqual(1);
    f().setControlValue(create(PersonSchema, { name: "John Doe" }));
    fixture.detectChanges();
    expect(f.name().errors().length).toEqual(0);
    f().setControlValue(create(PersonSchema, { name: "John123" }));
    fixture.detectChanges();
    expect(f.name().errors().length).toEqual(1);
  });
});
