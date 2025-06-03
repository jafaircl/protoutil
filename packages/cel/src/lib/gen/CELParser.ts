
import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { CELListener } from "./CELListener.js";
import { CELVisitor } from "./CELVisitor.js";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class CELParser extends antlr.Parser {
    public static readonly EQUALS = 1;
    public static readonly NOT_EQUALS = 2;
    public static readonly IN = 3;
    public static readonly LESS = 4;
    public static readonly LESS_EQUALS = 5;
    public static readonly GREATER_EQUALS = 6;
    public static readonly GREATER = 7;
    public static readonly LOGICAL_AND = 8;
    public static readonly LOGICAL_OR = 9;
    public static readonly LBRACKET = 10;
    public static readonly RPRACKET = 11;
    public static readonly LBRACE = 12;
    public static readonly RBRACE = 13;
    public static readonly LPAREN = 14;
    public static readonly RPAREN = 15;
    public static readonly DOT = 16;
    public static readonly COMMA = 17;
    public static readonly MINUS = 18;
    public static readonly EXCLAM = 19;
    public static readonly QUESTIONMARK = 20;
    public static readonly COLON = 21;
    public static readonly PLUS = 22;
    public static readonly STAR = 23;
    public static readonly SLASH = 24;
    public static readonly PERCENT = 25;
    public static readonly CEL_TRUE = 26;
    public static readonly CEL_FALSE = 27;
    public static readonly NUL = 28;
    public static readonly WHITESPACE = 29;
    public static readonly COMMENT = 30;
    public static readonly NUM_FLOAT = 31;
    public static readonly NUM_INT = 32;
    public static readonly NUM_UINT = 33;
    public static readonly STRING = 34;
    public static readonly BYTES = 35;
    public static readonly IDENTIFIER = 36;
    public static readonly ESC_IDENTIFIER = 37;
    public static readonly RULE_start = 0;
    public static readonly RULE_expr = 1;
    public static readonly RULE_conditionalOr = 2;
    public static readonly RULE_conditionalAnd = 3;
    public static readonly RULE_relation = 4;
    public static readonly RULE_calc = 5;
    public static readonly RULE_unary = 6;
    public static readonly RULE_member = 7;
    public static readonly RULE_primary = 8;
    public static readonly RULE_exprList = 9;
    public static readonly RULE_listInit = 10;
    public static readonly RULE_fieldInitializerList = 11;
    public static readonly RULE_optField = 12;
    public static readonly RULE_mapInitializerList = 13;
    public static readonly RULE_escapeIdent = 14;
    public static readonly RULE_optExpr = 15;
    public static readonly RULE_literal = 16;

    public static readonly literalNames = [
        null, "'=='", "'!='", "'in'", "'<'", "'<='", "'>='", "'>'", "'&&'", 
        "'||'", "'['", "']'", "'{'", "'}'", "'('", "')'", "'.'", "','", 
        "'-'", "'!'", "'?'", "':'", "'+'", "'*'", "'/'", "'%'", "'true'", 
        "'false'", "'null'"
    ];

    public static readonly symbolicNames = [
        null, "EQUALS", "NOT_EQUALS", "IN", "LESS", "LESS_EQUALS", "GREATER_EQUALS", 
        "GREATER", "LOGICAL_AND", "LOGICAL_OR", "LBRACKET", "RPRACKET", 
        "LBRACE", "RBRACE", "LPAREN", "RPAREN", "DOT", "COMMA", "MINUS", 
        "EXCLAM", "QUESTIONMARK", "COLON", "PLUS", "STAR", "SLASH", "PERCENT", 
        "CEL_TRUE", "CEL_FALSE", "NUL", "WHITESPACE", "COMMENT", "NUM_FLOAT", 
        "NUM_INT", "NUM_UINT", "STRING", "BYTES", "IDENTIFIER", "ESC_IDENTIFIER"
    ];
    public static readonly ruleNames = [
        "start", "expr", "conditionalOr", "conditionalAnd", "relation", 
        "calc", "unary", "member", "primary", "exprList", "listInit", "fieldInitializerList", 
        "optField", "mapInitializerList", "escapeIdent", "optExpr", "literal",
    ];

    public get grammarFileName(): string { return "CEL.g4"; }
    public get literalNames(): (string | null)[] { return CELParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return CELParser.symbolicNames; }
    public get ruleNames(): string[] { return CELParser.ruleNames; }
    public get serializedATN(): number[] { return CELParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, CELParser._ATN, CELParser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public start(): StartContext {
        let localContext = new StartContext(this.context, this.state);
        this.enterRule(localContext, 0, CELParser.RULE_start);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 34;
            localContext._e = this.expr();
            this.state = 35;
            this.match(CELParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public expr(): ExprContext {
        let localContext = new ExprContext(this.context, this.state);
        this.enterRule(localContext, 2, CELParser.RULE_expr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 37;
            localContext._e = this.conditionalOr();
            this.state = 43;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 20) {
                {
                this.state = 38;
                localContext._op = this.match(CELParser.QUESTIONMARK);
                this.state = 39;
                localContext._e1 = this.conditionalOr();
                this.state = 40;
                this.match(CELParser.COLON);
                this.state = 41;
                localContext._e2 = this.expr();
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public conditionalOr(): ConditionalOrContext {
        let localContext = new ConditionalOrContext(this.context, this.state);
        this.enterRule(localContext, 4, CELParser.RULE_conditionalOr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 45;
            localContext._e = this.conditionalAnd();
            this.state = 50;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 9) {
                {
                {
                this.state = 46;
                localContext._s9 = this.match(CELParser.LOGICAL_OR);
                localContext._ops.push(localContext._s9!);
                this.state = 47;
                localContext._conditionalAnd = this.conditionalAnd();
                localContext._e1.push(localContext._conditionalAnd!);
                }
                }
                this.state = 52;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public conditionalAnd(): ConditionalAndContext {
        let localContext = new ConditionalAndContext(this.context, this.state);
        this.enterRule(localContext, 6, CELParser.RULE_conditionalAnd);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 53;
            localContext._e = this.relation(0);
            this.state = 58;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 8) {
                {
                {
                this.state = 54;
                localContext._s8 = this.match(CELParser.LOGICAL_AND);
                localContext._ops.push(localContext._s8!);
                this.state = 55;
                localContext._relation = this.relation(0);
                localContext._e1.push(localContext._relation!);
                }
                }
                this.state = 60;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public relation(): RelationContext;
    public relation(_p: number): RelationContext;
    public relation(_p?: number): RelationContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new RelationContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 8;
        this.enterRecursionRule(localContext, 8, CELParser.RULE_relation, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            this.state = 62;
            this.calc(0);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 69;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    {
                    localContext = new RelationContext(parentContext, parentState);
                    this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_relation);
                    this.state = 64;
                    if (!(this.precpred(this.context, 1))) {
                        throw this.createFailedPredicateException("this.precpred(this.context, 1)");
                    }
                    this.state = 65;
                    localContext._op = this.tokenStream.LT(1);
                    _la = this.tokenStream.LA(1);
                    if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 254) !== 0))) {
                        localContext._op = this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 66;
                    this.relation(2);
                    }
                    }
                }
                this.state = 71;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 3, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }

    public calc(): CalcContext;
    public calc(_p: number): CalcContext;
    public calc(_p?: number): CalcContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new CalcContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 10;
        this.enterRecursionRule(localContext, 10, CELParser.RULE_calc, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            this.state = 73;
            this.unary();
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 83;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 81;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 4, this.context) ) {
                    case 1:
                        {
                        localContext = new CalcContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_calc);
                        this.state = 75;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 76;
                        localContext._op = this.tokenStream.LT(1);
                        _la = this.tokenStream.LA(1);
                        if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 58720256) !== 0))) {
                            localContext._op = this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 77;
                        this.calc(3);
                        }
                        break;
                    case 2:
                        {
                        localContext = new CalcContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_calc);
                        this.state = 78;
                        if (!(this.precpred(this.context, 1))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 1)");
                        }
                        this.state = 79;
                        localContext._op = this.tokenStream.LT(1);
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 18 || _la === 22)) {
                            localContext._op = this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 80;
                        this.calc(2);
                        }
                        break;
                    }
                    }
                }
                this.state = 85;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 5, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public unary(): UnaryContext {
        let localContext = new UnaryContext(this.context, this.state);
        this.enterRule(localContext, 12, CELParser.RULE_unary);
        let _la: number;
        try {
            let alternative: number;
            this.state = 99;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 8, this.context) ) {
            case 1:
                localContext = new MemberExprContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 86;
                this.member(0);
                }
                break;
            case 2:
                localContext = new LogicalNotContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 88;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                do {
                    {
                    {
                    this.state = 87;
                    (localContext as LogicalNotContext)._s19 = this.match(CELParser.EXCLAM);
                    (localContext as LogicalNotContext)._ops.push((localContext as LogicalNotContext)._s19!);
                    }
                    }
                    this.state = 90;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                } while (_la === 19);
                this.state = 92;
                this.member(0);
                }
                break;
            case 3:
                localContext = new NegateContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 94;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 93;
                        (localContext as NegateContext)._s18 = this.match(CELParser.MINUS);
                        (localContext as NegateContext)._ops.push((localContext as NegateContext)._s18!);
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 96;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 7, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                this.state = 98;
                this.member(0);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public member(): MemberContext;
    public member(_p: number): MemberContext;
    public member(_p?: number): MemberContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new MemberContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 14;
        this.enterRecursionRule(localContext, 14, CELParser.RULE_member, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            {
            localContext = new PrimaryExprContext(localContext);
            this.context = localContext;
            previousContext = localContext;

            this.state = 102;
            this.primary();
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 128;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 126;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 12, this.context) ) {
                    case 1:
                        {
                        localContext = new SelectContext(new MemberContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_member);
                        this.state = 104;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 105;
                        (localContext as SelectContext)._op = this.match(CELParser.DOT);
                        this.state = 107;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 20) {
                            {
                            this.state = 106;
                            (localContext as SelectContext)._opt = this.match(CELParser.QUESTIONMARK);
                            }
                        }

                        this.state = 109;
                        (localContext as SelectContext)._id = this.escapeIdent();
                        }
                        break;
                    case 2:
                        {
                        localContext = new MemberCallContext(new MemberContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_member);
                        this.state = 110;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 111;
                        (localContext as MemberCallContext)._op = this.match(CELParser.DOT);
                        this.state = 112;
                        (localContext as MemberCallContext)._id = this.match(CELParser.IDENTIFIER);
                        this.state = 113;
                        (localContext as MemberCallContext)._open = this.match(CELParser.LPAREN);
                        this.state = 115;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (((((_la - 10)) & ~0x1F) === 0 && ((1 << (_la - 10)) & 132580181) !== 0)) {
                            {
                            this.state = 114;
                            (localContext as MemberCallContext)._args = this.exprList();
                            }
                        }

                        this.state = 117;
                        this.match(CELParser.RPAREN);
                        }
                        break;
                    case 3:
                        {
                        localContext = new IndexContext(new MemberContext(parentContext, parentState));
                        this.pushNewRecursionContext(localContext, _startState, CELParser.RULE_member);
                        this.state = 118;
                        if (!(this.precpred(this.context, 1))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 1)");
                        }
                        this.state = 119;
                        (localContext as IndexContext)._op = this.match(CELParser.LBRACKET);
                        this.state = 121;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 20) {
                            {
                            this.state = 120;
                            (localContext as IndexContext)._opt = this.match(CELParser.QUESTIONMARK);
                            }
                        }

                        this.state = 123;
                        (localContext as IndexContext)._index = this.expr();
                        this.state = 124;
                        this.match(CELParser.RPRACKET);
                        }
                        break;
                    }
                    }
                }
                this.state = 130;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 13, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public primary(): PrimaryContext {
        let localContext = new PrimaryContext(this.context, this.state);
        this.enterRule(localContext, 16, CELParser.RULE_primary);
        let _la: number;
        try {
            this.state = 184;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 25, this.context) ) {
            case 1:
                localContext = new IdentContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 132;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16) {
                    {
                    this.state = 131;
                    (localContext as IdentContext)._leadingDot = this.match(CELParser.DOT);
                    }
                }

                this.state = 134;
                (localContext as IdentContext)._id = this.match(CELParser.IDENTIFIER);
                }
                break;
            case 2:
                localContext = new GlobalCallContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 136;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16) {
                    {
                    this.state = 135;
                    (localContext as GlobalCallContext)._leadingDot = this.match(CELParser.DOT);
                    }
                }

                this.state = 138;
                (localContext as GlobalCallContext)._id = this.match(CELParser.IDENTIFIER);
                {
                this.state = 139;
                (localContext as GlobalCallContext)._op = this.match(CELParser.LPAREN);
                this.state = 141;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 10)) & ~0x1F) === 0 && ((1 << (_la - 10)) & 132580181) !== 0)) {
                    {
                    this.state = 140;
                    (localContext as GlobalCallContext)._args = this.exprList();
                    }
                }

                this.state = 143;
                this.match(CELParser.RPAREN);
                }
                }
                break;
            case 3:
                localContext = new NestedContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 144;
                this.match(CELParser.LPAREN);
                this.state = 145;
                (localContext as NestedContext)._e = this.expr();
                this.state = 146;
                this.match(CELParser.RPAREN);
                }
                break;
            case 4:
                localContext = new CreateListContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 148;
                (localContext as CreateListContext)._op = this.match(CELParser.LBRACKET);
                this.state = 150;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 10)) & ~0x1F) === 0 && ((1 << (_la - 10)) & 132581205) !== 0)) {
                    {
                    this.state = 149;
                    (localContext as CreateListContext)._elems = this.listInit();
                    }
                }

                this.state = 153;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 17) {
                    {
                    this.state = 152;
                    this.match(CELParser.COMMA);
                    }
                }

                this.state = 155;
                this.match(CELParser.RPRACKET);
                }
                break;
            case 5:
                localContext = new CreateStructContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 156;
                (localContext as CreateStructContext)._op = this.match(CELParser.LBRACE);
                this.state = 158;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 10)) & ~0x1F) === 0 && ((1 << (_la - 10)) & 132581205) !== 0)) {
                    {
                    this.state = 157;
                    (localContext as CreateStructContext)._entries = this.mapInitializerList();
                    }
                }

                this.state = 161;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 17) {
                    {
                    this.state = 160;
                    this.match(CELParser.COMMA);
                    }
                }

                this.state = 163;
                this.match(CELParser.RBRACE);
                }
                break;
            case 6:
                localContext = new CreateMessageContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 165;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 16) {
                    {
                    this.state = 164;
                    (localContext as CreateMessageContext)._leadingDot = this.match(CELParser.DOT);
                    }
                }

                this.state = 167;
                (localContext as CreateMessageContext)._IDENTIFIER = this.match(CELParser.IDENTIFIER);
                (localContext as CreateMessageContext)._ids.push((localContext as CreateMessageContext)._IDENTIFIER!);
                this.state = 172;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 16) {
                    {
                    {
                    this.state = 168;
                    (localContext as CreateMessageContext)._s16 = this.match(CELParser.DOT);
                    (localContext as CreateMessageContext)._ops.push((localContext as CreateMessageContext)._s16!);
                    this.state = 169;
                    (localContext as CreateMessageContext)._IDENTIFIER = this.match(CELParser.IDENTIFIER);
                    (localContext as CreateMessageContext)._ids.push((localContext as CreateMessageContext)._IDENTIFIER!);
                    }
                    }
                    this.state = 174;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 175;
                (localContext as CreateMessageContext)._op = this.match(CELParser.LBRACE);
                this.state = 177;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 20)) & ~0x1F) === 0 && ((1 << (_la - 20)) & 196609) !== 0)) {
                    {
                    this.state = 176;
                    (localContext as CreateMessageContext)._entries = this.fieldInitializerList();
                    }
                }

                this.state = 180;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 17) {
                    {
                    this.state = 179;
                    this.match(CELParser.COMMA);
                    }
                }

                this.state = 182;
                this.match(CELParser.RBRACE);
                }
                break;
            case 7:
                localContext = new ConstantLiteralContext(localContext);
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 183;
                this.literal();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public exprList(): ExprListContext {
        let localContext = new ExprListContext(this.context, this.state);
        this.enterRule(localContext, 18, CELParser.RULE_exprList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 186;
            localContext._expr = this.expr();
            localContext._e.push(localContext._expr!);
            this.state = 191;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 17) {
                {
                {
                this.state = 187;
                this.match(CELParser.COMMA);
                this.state = 188;
                localContext._expr = this.expr();
                localContext._e.push(localContext._expr!);
                }
                }
                this.state = 193;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public listInit(): ListInitContext {
        let localContext = new ListInitContext(this.context, this.state);
        this.enterRule(localContext, 20, CELParser.RULE_listInit);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 194;
            localContext._optExpr = this.optExpr();
            localContext._elems.push(localContext._optExpr!);
            this.state = 199;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 195;
                    this.match(CELParser.COMMA);
                    this.state = 196;
                    localContext._optExpr = this.optExpr();
                    localContext._elems.push(localContext._optExpr!);
                    }
                    }
                }
                this.state = 201;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 27, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public fieldInitializerList(): FieldInitializerListContext {
        let localContext = new FieldInitializerListContext(this.context, this.state);
        this.enterRule(localContext, 22, CELParser.RULE_fieldInitializerList);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 202;
            localContext._optField = this.optField();
            localContext._fields.push(localContext._optField!);
            this.state = 203;
            localContext._s21 = this.match(CELParser.COLON);
            localContext._cols.push(localContext._s21!);
            this.state = 204;
            localContext._expr = this.expr();
            localContext._values.push(localContext._expr!);
            this.state = 212;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 28, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 205;
                    this.match(CELParser.COMMA);
                    this.state = 206;
                    localContext._optField = this.optField();
                    localContext._fields.push(localContext._optField!);
                    this.state = 207;
                    localContext._s21 = this.match(CELParser.COLON);
                    localContext._cols.push(localContext._s21!);
                    this.state = 208;
                    localContext._expr = this.expr();
                    localContext._values.push(localContext._expr!);
                    }
                    }
                }
                this.state = 214;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 28, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public optField(): OptFieldContext {
        let localContext = new OptFieldContext(this.context, this.state);
        this.enterRule(localContext, 24, CELParser.RULE_optField);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 216;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 20) {
                {
                this.state = 215;
                localContext._opt = this.match(CELParser.QUESTIONMARK);
                }
            }

            this.state = 218;
            this.escapeIdent();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public mapInitializerList(): MapInitializerListContext {
        let localContext = new MapInitializerListContext(this.context, this.state);
        this.enterRule(localContext, 26, CELParser.RULE_mapInitializerList);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 220;
            localContext._optExpr = this.optExpr();
            localContext._keys.push(localContext._optExpr!);
            this.state = 221;
            localContext._s21 = this.match(CELParser.COLON);
            localContext._cols.push(localContext._s21!);
            this.state = 222;
            localContext._expr = this.expr();
            localContext._values.push(localContext._expr!);
            this.state = 230;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 223;
                    this.match(CELParser.COMMA);
                    this.state = 224;
                    localContext._optExpr = this.optExpr();
                    localContext._keys.push(localContext._optExpr!);
                    this.state = 225;
                    localContext._s21 = this.match(CELParser.COLON);
                    localContext._cols.push(localContext._s21!);
                    this.state = 226;
                    localContext._expr = this.expr();
                    localContext._values.push(localContext._expr!);
                    }
                    }
                }
                this.state = 232;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public escapeIdent(): EscapeIdentContext {
        let localContext = new EscapeIdentContext(this.context, this.state);
        this.enterRule(localContext, 28, CELParser.RULE_escapeIdent);
        try {
            this.state = 235;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case CELParser.IDENTIFIER:
                localContext = new SimpleIdentifierContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 233;
                (localContext as SimpleIdentifierContext)._id = this.match(CELParser.IDENTIFIER);
                }
                break;
            case CELParser.ESC_IDENTIFIER:
                localContext = new EscapedIdentifierContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 234;
                (localContext as EscapedIdentifierContext)._id = this.match(CELParser.ESC_IDENTIFIER);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public optExpr(): OptExprContext {
        let localContext = new OptExprContext(this.context, this.state);
        this.enterRule(localContext, 30, CELParser.RULE_optExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 238;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 20) {
                {
                this.state = 237;
                localContext._opt = this.match(CELParser.QUESTIONMARK);
                }
            }

            this.state = 240;
            localContext._e = this.expr();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public literal(): LiteralContext {
        let localContext = new LiteralContext(this.context, this.state);
        this.enterRule(localContext, 32, CELParser.RULE_literal);
        let _la: number;
        try {
            this.state = 256;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 35, this.context) ) {
            case 1:
                localContext = new IntContext(localContext);
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 243;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 18) {
                    {
                    this.state = 242;
                    (localContext as IntContext)._sign = this.match(CELParser.MINUS);
                    }
                }

                this.state = 245;
                (localContext as IntContext)._tok = this.match(CELParser.NUM_INT);
                }
                break;
            case 2:
                localContext = new UintContext(localContext);
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 246;
                (localContext as UintContext)._tok = this.match(CELParser.NUM_UINT);
                }
                break;
            case 3:
                localContext = new DoubleContext(localContext);
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 248;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 18) {
                    {
                    this.state = 247;
                    (localContext as DoubleContext)._sign = this.match(CELParser.MINUS);
                    }
                }

                this.state = 250;
                (localContext as DoubleContext)._tok = this.match(CELParser.NUM_FLOAT);
                }
                break;
            case 4:
                localContext = new StringContext(localContext);
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 251;
                (localContext as StringContext)._tok = this.match(CELParser.STRING);
                }
                break;
            case 5:
                localContext = new BytesContext(localContext);
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 252;
                (localContext as BytesContext)._tok = this.match(CELParser.BYTES);
                }
                break;
            case 6:
                localContext = new BoolTrueContext(localContext);
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 253;
                (localContext as BoolTrueContext)._tok = this.match(CELParser.CEL_TRUE);
                }
                break;
            case 7:
                localContext = new BoolFalseContext(localContext);
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 254;
                (localContext as BoolFalseContext)._tok = this.match(CELParser.CEL_FALSE);
                }
                break;
            case 8:
                localContext = new NullContext(localContext);
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 255;
                (localContext as NullContext)._tok = this.match(CELParser.NUL);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 4:
            return this.relation_sempred(localContext as RelationContext, predIndex);
        case 5:
            return this.calc_sempred(localContext as CalcContext, predIndex);
        case 7:
            return this.member_sempred(localContext as MemberContext, predIndex);
        }
        return true;
    }
    private relation_sempred(localContext: RelationContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 1);
        }
        return true;
    }
    private calc_sempred(localContext: CalcContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 1:
            return this.precpred(this.context, 2);
        case 2:
            return this.precpred(this.context, 1);
        }
        return true;
    }
    private member_sempred(localContext: MemberContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 3:
            return this.precpred(this.context, 3);
        case 4:
            return this.precpred(this.context, 2);
        case 5:
            return this.precpred(this.context, 1);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,37,259,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,
        6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,13,
        2,14,7,14,2,15,7,15,2,16,7,16,1,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,
        1,3,1,44,8,1,1,2,1,2,1,2,5,2,49,8,2,10,2,12,2,52,9,2,1,3,1,3,1,3,
        5,3,57,8,3,10,3,12,3,60,9,3,1,4,1,4,1,4,1,4,1,4,1,4,5,4,68,8,4,10,
        4,12,4,71,9,4,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,1,5,5,5,82,8,5,10,
        5,12,5,85,9,5,1,6,1,6,4,6,89,8,6,11,6,12,6,90,1,6,1,6,4,6,95,8,6,
        11,6,12,6,96,1,6,3,6,100,8,6,1,7,1,7,1,7,1,7,1,7,1,7,3,7,108,8,7,
        1,7,1,7,1,7,1,7,1,7,1,7,3,7,116,8,7,1,7,1,7,1,7,1,7,3,7,122,8,7,
        1,7,1,7,1,7,5,7,127,8,7,10,7,12,7,130,9,7,1,8,3,8,133,8,8,1,8,1,
        8,3,8,137,8,8,1,8,1,8,1,8,3,8,142,8,8,1,8,1,8,1,8,1,8,1,8,1,8,1,
        8,3,8,151,8,8,1,8,3,8,154,8,8,1,8,1,8,1,8,3,8,159,8,8,1,8,3,8,162,
        8,8,1,8,1,8,3,8,166,8,8,1,8,1,8,1,8,5,8,171,8,8,10,8,12,8,174,9,
        8,1,8,1,8,3,8,178,8,8,1,8,3,8,181,8,8,1,8,1,8,3,8,185,8,8,1,9,1,
        9,1,9,5,9,190,8,9,10,9,12,9,193,9,9,1,10,1,10,1,10,5,10,198,8,10,
        10,10,12,10,201,9,10,1,11,1,11,1,11,1,11,1,11,1,11,1,11,1,11,5,11,
        211,8,11,10,11,12,11,214,9,11,1,12,3,12,217,8,12,1,12,1,12,1,13,
        1,13,1,13,1,13,1,13,1,13,1,13,1,13,5,13,229,8,13,10,13,12,13,232,
        9,13,1,14,1,14,3,14,236,8,14,1,15,3,15,239,8,15,1,15,1,15,1,16,3,
        16,244,8,16,1,16,1,16,1,16,3,16,249,8,16,1,16,1,16,1,16,1,16,1,16,
        1,16,3,16,257,8,16,1,16,0,3,8,10,14,17,0,2,4,6,8,10,12,14,16,18,
        20,22,24,26,28,30,32,0,3,1,0,1,7,1,0,23,25,2,0,18,18,22,22,290,0,
        34,1,0,0,0,2,37,1,0,0,0,4,45,1,0,0,0,6,53,1,0,0,0,8,61,1,0,0,0,10,
        72,1,0,0,0,12,99,1,0,0,0,14,101,1,0,0,0,16,184,1,0,0,0,18,186,1,
        0,0,0,20,194,1,0,0,0,22,202,1,0,0,0,24,216,1,0,0,0,26,220,1,0,0,
        0,28,235,1,0,0,0,30,238,1,0,0,0,32,256,1,0,0,0,34,35,3,2,1,0,35,
        36,5,0,0,1,36,1,1,0,0,0,37,43,3,4,2,0,38,39,5,20,0,0,39,40,3,4,2,
        0,40,41,5,21,0,0,41,42,3,2,1,0,42,44,1,0,0,0,43,38,1,0,0,0,43,44,
        1,0,0,0,44,3,1,0,0,0,45,50,3,6,3,0,46,47,5,9,0,0,47,49,3,6,3,0,48,
        46,1,0,0,0,49,52,1,0,0,0,50,48,1,0,0,0,50,51,1,0,0,0,51,5,1,0,0,
        0,52,50,1,0,0,0,53,58,3,8,4,0,54,55,5,8,0,0,55,57,3,8,4,0,56,54,
        1,0,0,0,57,60,1,0,0,0,58,56,1,0,0,0,58,59,1,0,0,0,59,7,1,0,0,0,60,
        58,1,0,0,0,61,62,6,4,-1,0,62,63,3,10,5,0,63,69,1,0,0,0,64,65,10,
        1,0,0,65,66,7,0,0,0,66,68,3,8,4,2,67,64,1,0,0,0,68,71,1,0,0,0,69,
        67,1,0,0,0,69,70,1,0,0,0,70,9,1,0,0,0,71,69,1,0,0,0,72,73,6,5,-1,
        0,73,74,3,12,6,0,74,83,1,0,0,0,75,76,10,2,0,0,76,77,7,1,0,0,77,82,
        3,10,5,3,78,79,10,1,0,0,79,80,7,2,0,0,80,82,3,10,5,2,81,75,1,0,0,
        0,81,78,1,0,0,0,82,85,1,0,0,0,83,81,1,0,0,0,83,84,1,0,0,0,84,11,
        1,0,0,0,85,83,1,0,0,0,86,100,3,14,7,0,87,89,5,19,0,0,88,87,1,0,0,
        0,89,90,1,0,0,0,90,88,1,0,0,0,90,91,1,0,0,0,91,92,1,0,0,0,92,100,
        3,14,7,0,93,95,5,18,0,0,94,93,1,0,0,0,95,96,1,0,0,0,96,94,1,0,0,
        0,96,97,1,0,0,0,97,98,1,0,0,0,98,100,3,14,7,0,99,86,1,0,0,0,99,88,
        1,0,0,0,99,94,1,0,0,0,100,13,1,0,0,0,101,102,6,7,-1,0,102,103,3,
        16,8,0,103,128,1,0,0,0,104,105,10,3,0,0,105,107,5,16,0,0,106,108,
        5,20,0,0,107,106,1,0,0,0,107,108,1,0,0,0,108,109,1,0,0,0,109,127,
        3,28,14,0,110,111,10,2,0,0,111,112,5,16,0,0,112,113,5,36,0,0,113,
        115,5,14,0,0,114,116,3,18,9,0,115,114,1,0,0,0,115,116,1,0,0,0,116,
        117,1,0,0,0,117,127,5,15,0,0,118,119,10,1,0,0,119,121,5,10,0,0,120,
        122,5,20,0,0,121,120,1,0,0,0,121,122,1,0,0,0,122,123,1,0,0,0,123,
        124,3,2,1,0,124,125,5,11,0,0,125,127,1,0,0,0,126,104,1,0,0,0,126,
        110,1,0,0,0,126,118,1,0,0,0,127,130,1,0,0,0,128,126,1,0,0,0,128,
        129,1,0,0,0,129,15,1,0,0,0,130,128,1,0,0,0,131,133,5,16,0,0,132,
        131,1,0,0,0,132,133,1,0,0,0,133,134,1,0,0,0,134,185,5,36,0,0,135,
        137,5,16,0,0,136,135,1,0,0,0,136,137,1,0,0,0,137,138,1,0,0,0,138,
        139,5,36,0,0,139,141,5,14,0,0,140,142,3,18,9,0,141,140,1,0,0,0,141,
        142,1,0,0,0,142,143,1,0,0,0,143,185,5,15,0,0,144,145,5,14,0,0,145,
        146,3,2,1,0,146,147,5,15,0,0,147,185,1,0,0,0,148,150,5,10,0,0,149,
        151,3,20,10,0,150,149,1,0,0,0,150,151,1,0,0,0,151,153,1,0,0,0,152,
        154,5,17,0,0,153,152,1,0,0,0,153,154,1,0,0,0,154,155,1,0,0,0,155,
        185,5,11,0,0,156,158,5,12,0,0,157,159,3,26,13,0,158,157,1,0,0,0,
        158,159,1,0,0,0,159,161,1,0,0,0,160,162,5,17,0,0,161,160,1,0,0,0,
        161,162,1,0,0,0,162,163,1,0,0,0,163,185,5,13,0,0,164,166,5,16,0,
        0,165,164,1,0,0,0,165,166,1,0,0,0,166,167,1,0,0,0,167,172,5,36,0,
        0,168,169,5,16,0,0,169,171,5,36,0,0,170,168,1,0,0,0,171,174,1,0,
        0,0,172,170,1,0,0,0,172,173,1,0,0,0,173,175,1,0,0,0,174,172,1,0,
        0,0,175,177,5,12,0,0,176,178,3,22,11,0,177,176,1,0,0,0,177,178,1,
        0,0,0,178,180,1,0,0,0,179,181,5,17,0,0,180,179,1,0,0,0,180,181,1,
        0,0,0,181,182,1,0,0,0,182,185,5,13,0,0,183,185,3,32,16,0,184,132,
        1,0,0,0,184,136,1,0,0,0,184,144,1,0,0,0,184,148,1,0,0,0,184,156,
        1,0,0,0,184,165,1,0,0,0,184,183,1,0,0,0,185,17,1,0,0,0,186,191,3,
        2,1,0,187,188,5,17,0,0,188,190,3,2,1,0,189,187,1,0,0,0,190,193,1,
        0,0,0,191,189,1,0,0,0,191,192,1,0,0,0,192,19,1,0,0,0,193,191,1,0,
        0,0,194,199,3,30,15,0,195,196,5,17,0,0,196,198,3,30,15,0,197,195,
        1,0,0,0,198,201,1,0,0,0,199,197,1,0,0,0,199,200,1,0,0,0,200,21,1,
        0,0,0,201,199,1,0,0,0,202,203,3,24,12,0,203,204,5,21,0,0,204,212,
        3,2,1,0,205,206,5,17,0,0,206,207,3,24,12,0,207,208,5,21,0,0,208,
        209,3,2,1,0,209,211,1,0,0,0,210,205,1,0,0,0,211,214,1,0,0,0,212,
        210,1,0,0,0,212,213,1,0,0,0,213,23,1,0,0,0,214,212,1,0,0,0,215,217,
        5,20,0,0,216,215,1,0,0,0,216,217,1,0,0,0,217,218,1,0,0,0,218,219,
        3,28,14,0,219,25,1,0,0,0,220,221,3,30,15,0,221,222,5,21,0,0,222,
        230,3,2,1,0,223,224,5,17,0,0,224,225,3,30,15,0,225,226,5,21,0,0,
        226,227,3,2,1,0,227,229,1,0,0,0,228,223,1,0,0,0,229,232,1,0,0,0,
        230,228,1,0,0,0,230,231,1,0,0,0,231,27,1,0,0,0,232,230,1,0,0,0,233,
        236,5,36,0,0,234,236,5,37,0,0,235,233,1,0,0,0,235,234,1,0,0,0,236,
        29,1,0,0,0,237,239,5,20,0,0,238,237,1,0,0,0,238,239,1,0,0,0,239,
        240,1,0,0,0,240,241,3,2,1,0,241,31,1,0,0,0,242,244,5,18,0,0,243,
        242,1,0,0,0,243,244,1,0,0,0,244,245,1,0,0,0,245,257,5,32,0,0,246,
        257,5,33,0,0,247,249,5,18,0,0,248,247,1,0,0,0,248,249,1,0,0,0,249,
        250,1,0,0,0,250,257,5,31,0,0,251,257,5,34,0,0,252,257,5,35,0,0,253,
        257,5,26,0,0,254,257,5,27,0,0,255,257,5,28,0,0,256,243,1,0,0,0,256,
        246,1,0,0,0,256,248,1,0,0,0,256,251,1,0,0,0,256,252,1,0,0,0,256,
        253,1,0,0,0,256,254,1,0,0,0,256,255,1,0,0,0,257,33,1,0,0,0,36,43,
        50,58,69,81,83,90,96,99,107,115,121,126,128,132,136,141,150,153,
        158,161,165,172,177,180,184,191,199,212,216,230,235,238,243,248,
        256
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!CELParser.__ATN) {
            CELParser.__ATN = new antlr.ATNDeserializer().deserialize(CELParser._serializedATN);
        }

        return CELParser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(CELParser.literalNames, CELParser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return CELParser.vocabulary;
    }

    private static readonly decisionsToDFA = CELParser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class StartContext extends antlr.ParserRuleContext {
    public _e?: ExprContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(CELParser.EOF, 0)!;
    }
    public expr(): ExprContext {
        return this.getRuleContext(0, ExprContext)!;
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_start;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterStart) {
             listener.enterStart(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitStart) {
             listener.exitStart(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitStart) {
            return visitor.visitStart(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExprContext extends antlr.ParserRuleContext {
    public _e?: ConditionalOrContext;
    public _op?: Token | null;
    public _e1?: ConditionalOrContext;
    public _e2?: ExprContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public conditionalOr(): ConditionalOrContext[];
    public conditionalOr(i: number): ConditionalOrContext | null;
    public conditionalOr(i?: number): ConditionalOrContext[] | ConditionalOrContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ConditionalOrContext);
        }

        return this.getRuleContext(i, ConditionalOrContext);
    }
    public COLON(): antlr.TerminalNode | null {
        return this.getToken(CELParser.COLON, 0);
    }
    public QUESTIONMARK(): antlr.TerminalNode | null {
        return this.getToken(CELParser.QUESTIONMARK, 0);
    }
    public expr(): ExprContext | null {
        return this.getRuleContext(0, ExprContext);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_expr;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterExpr) {
             listener.enterExpr(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitExpr) {
             listener.exitExpr(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitExpr) {
            return visitor.visitExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ConditionalOrContext extends antlr.ParserRuleContext {
    public _e?: ConditionalAndContext;
    public _s9?: Token | null;
    public _ops: antlr.Token[] = [];
    public _conditionalAnd?: ConditionalAndContext;
    public _e1: ConditionalAndContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public conditionalAnd(): ConditionalAndContext[];
    public conditionalAnd(i: number): ConditionalAndContext | null;
    public conditionalAnd(i?: number): ConditionalAndContext[] | ConditionalAndContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ConditionalAndContext);
        }

        return this.getRuleContext(i, ConditionalAndContext);
    }
    public LOGICAL_OR(): antlr.TerminalNode[];
    public LOGICAL_OR(i: number): antlr.TerminalNode | null;
    public LOGICAL_OR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.LOGICAL_OR);
    	} else {
    		return this.getToken(CELParser.LOGICAL_OR, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_conditionalOr;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterConditionalOr) {
             listener.enterConditionalOr(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitConditionalOr) {
             listener.exitConditionalOr(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitConditionalOr) {
            return visitor.visitConditionalOr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ConditionalAndContext extends antlr.ParserRuleContext {
    public _e?: RelationContext;
    public _s8?: Token | null;
    public _ops: antlr.Token[] = [];
    public _relation?: RelationContext;
    public _e1: RelationContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public relation(): RelationContext[];
    public relation(i: number): RelationContext | null;
    public relation(i?: number): RelationContext[] | RelationContext | null {
        if (i === undefined) {
            return this.getRuleContexts(RelationContext);
        }

        return this.getRuleContext(i, RelationContext);
    }
    public LOGICAL_AND(): antlr.TerminalNode[];
    public LOGICAL_AND(i: number): antlr.TerminalNode | null;
    public LOGICAL_AND(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.LOGICAL_AND);
    	} else {
    		return this.getToken(CELParser.LOGICAL_AND, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_conditionalAnd;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterConditionalAnd) {
             listener.enterConditionalAnd(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitConditionalAnd) {
             listener.exitConditionalAnd(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitConditionalAnd) {
            return visitor.visitConditionalAnd(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class RelationContext extends antlr.ParserRuleContext {
    public _op?: Token | null;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public calc(): CalcContext | null {
        return this.getRuleContext(0, CalcContext);
    }
    public relation(): RelationContext[];
    public relation(i: number): RelationContext | null;
    public relation(i?: number): RelationContext[] | RelationContext | null {
        if (i === undefined) {
            return this.getRuleContexts(RelationContext);
        }

        return this.getRuleContext(i, RelationContext);
    }
    public LESS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.LESS, 0);
    }
    public LESS_EQUALS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.LESS_EQUALS, 0);
    }
    public GREATER_EQUALS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.GREATER_EQUALS, 0);
    }
    public GREATER(): antlr.TerminalNode | null {
        return this.getToken(CELParser.GREATER, 0);
    }
    public EQUALS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.EQUALS, 0);
    }
    public NOT_EQUALS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.NOT_EQUALS, 0);
    }
    public IN(): antlr.TerminalNode | null {
        return this.getToken(CELParser.IN, 0);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_relation;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterRelation) {
             listener.enterRelation(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitRelation) {
             listener.exitRelation(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitRelation) {
            return visitor.visitRelation(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CalcContext extends antlr.ParserRuleContext {
    public _op?: Token | null;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public unary(): UnaryContext | null {
        return this.getRuleContext(0, UnaryContext);
    }
    public calc(): CalcContext[];
    public calc(i: number): CalcContext | null;
    public calc(i?: number): CalcContext[] | CalcContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CalcContext);
        }

        return this.getRuleContext(i, CalcContext);
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(CELParser.STAR, 0);
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(CELParser.SLASH, 0);
    }
    public PERCENT(): antlr.TerminalNode | null {
        return this.getToken(CELParser.PERCENT, 0);
    }
    public PLUS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.PLUS, 0);
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.MINUS, 0);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_calc;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterCalc) {
             listener.enterCalc(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitCalc) {
             listener.exitCalc(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitCalc) {
            return visitor.visitCalc(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class UnaryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_unary;
    }
    public override copyFrom(ctx: UnaryContext): void {
        super.copyFrom(ctx);
    }
}
export class MemberExprContext extends UnaryContext {
    public constructor(ctx: UnaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterMemberExpr) {
             listener.enterMemberExpr(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitMemberExpr) {
             listener.exitMemberExpr(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitMemberExpr) {
            return visitor.visitMemberExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class LogicalNotContext extends UnaryContext {
    public _s19?: Token | null;
    public _ops: antlr.Token[] = [];
    public constructor(ctx: UnaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public EXCLAM(): antlr.TerminalNode[];
    public EXCLAM(i: number): antlr.TerminalNode | null;
    public EXCLAM(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.EXCLAM);
    	} else {
    		return this.getToken(CELParser.EXCLAM, i);
    	}
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterLogicalNot) {
             listener.enterLogicalNot(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitLogicalNot) {
             listener.exitLogicalNot(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitLogicalNot) {
            return visitor.visitLogicalNot(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class NegateContext extends UnaryContext {
    public _s18?: Token | null;
    public _ops: antlr.Token[] = [];
    public constructor(ctx: UnaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public MINUS(): antlr.TerminalNode[];
    public MINUS(i: number): antlr.TerminalNode | null;
    public MINUS(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.MINUS);
    	} else {
    		return this.getToken(CELParser.MINUS, i);
    	}
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterNegate) {
             listener.enterNegate(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitNegate) {
             listener.exitNegate(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitNegate) {
            return visitor.visitNegate(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class MemberContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_member;
    }
    public override copyFrom(ctx: MemberContext): void {
        super.copyFrom(ctx);
    }
}
export class PrimaryExprContext extends MemberContext {
    public constructor(ctx: MemberContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public primary(): PrimaryContext {
        return this.getRuleContext(0, PrimaryContext)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterPrimaryExpr) {
             listener.enterPrimaryExpr(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitPrimaryExpr) {
             listener.exitPrimaryExpr(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitPrimaryExpr) {
            return visitor.visitPrimaryExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class SelectContext extends MemberContext {
    public _op?: Token | null;
    public _opt?: Token | null;
    public _id?: EscapeIdentContext;
    public constructor(ctx: MemberContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public DOT(): antlr.TerminalNode {
        return this.getToken(CELParser.DOT, 0)!;
    }
    public escapeIdent(): EscapeIdentContext {
        return this.getRuleContext(0, EscapeIdentContext)!;
    }
    public QUESTIONMARK(): antlr.TerminalNode | null {
        return this.getToken(CELParser.QUESTIONMARK, 0);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterSelect) {
             listener.enterSelect(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitSelect) {
             listener.exitSelect(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitSelect) {
            return visitor.visitSelect(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class MemberCallContext extends MemberContext {
    public _op?: Token | null;
    public _id?: Token | null;
    public _open?: Token | null;
    public _args?: ExprListContext;
    public constructor(ctx: MemberContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(CELParser.RPAREN, 0)!;
    }
    public DOT(): antlr.TerminalNode {
        return this.getToken(CELParser.DOT, 0)!;
    }
    public IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CELParser.IDENTIFIER, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(CELParser.LPAREN, 0)!;
    }
    public exprList(): ExprListContext | null {
        return this.getRuleContext(0, ExprListContext);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterMemberCall) {
             listener.enterMemberCall(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitMemberCall) {
             listener.exitMemberCall(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitMemberCall) {
            return visitor.visitMemberCall(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class IndexContext extends MemberContext {
    public _op?: Token | null;
    public _opt?: Token | null;
    public _index?: ExprContext;
    public constructor(ctx: MemberContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public member(): MemberContext {
        return this.getRuleContext(0, MemberContext)!;
    }
    public RPRACKET(): antlr.TerminalNode {
        return this.getToken(CELParser.RPRACKET, 0)!;
    }
    public LBRACKET(): antlr.TerminalNode {
        return this.getToken(CELParser.LBRACKET, 0)!;
    }
    public expr(): ExprContext {
        return this.getRuleContext(0, ExprContext)!;
    }
    public QUESTIONMARK(): antlr.TerminalNode | null {
        return this.getToken(CELParser.QUESTIONMARK, 0);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterIndex) {
             listener.enterIndex(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitIndex) {
             listener.exitIndex(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitIndex) {
            return visitor.visitIndex(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class PrimaryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_primary;
    }
    public override copyFrom(ctx: PrimaryContext): void {
        super.copyFrom(ctx);
    }
}
export class IdentContext extends PrimaryContext {
    public _leadingDot?: Token | null;
    public _id?: Token | null;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CELParser.IDENTIFIER, 0)!;
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(CELParser.DOT, 0);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterIdent) {
             listener.enterIdent(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitIdent) {
             listener.exitIdent(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitIdent) {
            return visitor.visitIdent(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class GlobalCallContext extends PrimaryContext {
    public _leadingDot?: Token | null;
    public _id?: Token | null;
    public _op?: Token | null;
    public _args?: ExprListContext;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CELParser.IDENTIFIER, 0)!;
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(CELParser.RPAREN, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(CELParser.LPAREN, 0);
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(CELParser.DOT, 0);
    }
    public exprList(): ExprListContext | null {
        return this.getRuleContext(0, ExprListContext);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterGlobalCall) {
             listener.enterGlobalCall(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitGlobalCall) {
             listener.exitGlobalCall(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitGlobalCall) {
            return visitor.visitGlobalCall(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class NestedContext extends PrimaryContext {
    public _e?: ExprContext;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(CELParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(CELParser.RPAREN, 0)!;
    }
    public expr(): ExprContext {
        return this.getRuleContext(0, ExprContext)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterNested) {
             listener.enterNested(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitNested) {
             listener.exitNested(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitNested) {
            return visitor.visitNested(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class CreateListContext extends PrimaryContext {
    public _op?: Token | null;
    public _elems?: ListInitContext;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public RPRACKET(): antlr.TerminalNode {
        return this.getToken(CELParser.RPRACKET, 0)!;
    }
    public LBRACKET(): antlr.TerminalNode {
        return this.getToken(CELParser.LBRACKET, 0)!;
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(CELParser.COMMA, 0);
    }
    public listInit(): ListInitContext | null {
        return this.getRuleContext(0, ListInitContext);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterCreateList) {
             listener.enterCreateList(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitCreateList) {
             listener.exitCreateList(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitCreateList) {
            return visitor.visitCreateList(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class CreateStructContext extends PrimaryContext {
    public _op?: Token | null;
    public _entries?: MapInitializerListContext;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public RBRACE(): antlr.TerminalNode {
        return this.getToken(CELParser.RBRACE, 0)!;
    }
    public LBRACE(): antlr.TerminalNode {
        return this.getToken(CELParser.LBRACE, 0)!;
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(CELParser.COMMA, 0);
    }
    public mapInitializerList(): MapInitializerListContext | null {
        return this.getRuleContext(0, MapInitializerListContext);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterCreateStruct) {
             listener.enterCreateStruct(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitCreateStruct) {
             listener.exitCreateStruct(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitCreateStruct) {
            return visitor.visitCreateStruct(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class CreateMessageContext extends PrimaryContext {
    public _leadingDot?: Token | null;
    public _IDENTIFIER?: Token | null;
    public _ids: antlr.Token[] = [];
    public _s16?: Token | null;
    public _ops: antlr.Token[] = [];
    public _op?: Token | null;
    public _entries?: FieldInitializerListContext;
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public RBRACE(): antlr.TerminalNode {
        return this.getToken(CELParser.RBRACE, 0)!;
    }
    public IDENTIFIER(): antlr.TerminalNode[];
    public IDENTIFIER(i: number): antlr.TerminalNode | null;
    public IDENTIFIER(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.IDENTIFIER);
    	} else {
    		return this.getToken(CELParser.IDENTIFIER, i);
    	}
    }
    public LBRACE(): antlr.TerminalNode {
        return this.getToken(CELParser.LBRACE, 0)!;
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(CELParser.COMMA, 0);
    }
    public DOT(): antlr.TerminalNode[];
    public DOT(i: number): antlr.TerminalNode | null;
    public DOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.DOT);
    	} else {
    		return this.getToken(CELParser.DOT, i);
    	}
    }
    public fieldInitializerList(): FieldInitializerListContext | null {
        return this.getRuleContext(0, FieldInitializerListContext);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterCreateMessage) {
             listener.enterCreateMessage(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitCreateMessage) {
             listener.exitCreateMessage(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitCreateMessage) {
            return visitor.visitCreateMessage(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class ConstantLiteralContext extends PrimaryContext {
    public constructor(ctx: PrimaryContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public literal(): LiteralContext {
        return this.getRuleContext(0, LiteralContext)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterConstantLiteral) {
             listener.enterConstantLiteral(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitConstantLiteral) {
             listener.exitConstantLiteral(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitConstantLiteral) {
            return visitor.visitConstantLiteral(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExprListContext extends antlr.ParserRuleContext {
    public _expr?: ExprContext;
    public _e: ExprContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expr(): ExprContext[];
    public expr(i: number): ExprContext | null;
    public expr(i?: number): ExprContext[] | ExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExprContext);
        }

        return this.getRuleContext(i, ExprContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COMMA);
    	} else {
    		return this.getToken(CELParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_exprList;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterExprList) {
             listener.enterExprList(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitExprList) {
             listener.exitExprList(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitExprList) {
            return visitor.visitExprList(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ListInitContext extends antlr.ParserRuleContext {
    public _optExpr?: OptExprContext;
    public _elems: OptExprContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public optExpr(): OptExprContext[];
    public optExpr(i: number): OptExprContext | null;
    public optExpr(i?: number): OptExprContext[] | OptExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OptExprContext);
        }

        return this.getRuleContext(i, OptExprContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COMMA);
    	} else {
    		return this.getToken(CELParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_listInit;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterListInit) {
             listener.enterListInit(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitListInit) {
             listener.exitListInit(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitListInit) {
            return visitor.visitListInit(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FieldInitializerListContext extends antlr.ParserRuleContext {
    public _optField?: OptFieldContext;
    public _fields: OptFieldContext[] = [];
    public _s21?: Token | null;
    public _cols: antlr.Token[] = [];
    public _expr?: ExprContext;
    public _values: ExprContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public optField(): OptFieldContext[];
    public optField(i: number): OptFieldContext | null;
    public optField(i?: number): OptFieldContext[] | OptFieldContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OptFieldContext);
        }

        return this.getRuleContext(i, OptFieldContext);
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COLON);
    	} else {
    		return this.getToken(CELParser.COLON, i);
    	}
    }
    public expr(): ExprContext[];
    public expr(i: number): ExprContext | null;
    public expr(i?: number): ExprContext[] | ExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExprContext);
        }

        return this.getRuleContext(i, ExprContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COMMA);
    	} else {
    		return this.getToken(CELParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_fieldInitializerList;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterFieldInitializerList) {
             listener.enterFieldInitializerList(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitFieldInitializerList) {
             listener.exitFieldInitializerList(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitFieldInitializerList) {
            return visitor.visitFieldInitializerList(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class OptFieldContext extends antlr.ParserRuleContext {
    public _opt?: Token | null;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public escapeIdent(): EscapeIdentContext {
        return this.getRuleContext(0, EscapeIdentContext)!;
    }
    public QUESTIONMARK(): antlr.TerminalNode | null {
        return this.getToken(CELParser.QUESTIONMARK, 0);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_optField;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterOptField) {
             listener.enterOptField(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitOptField) {
             listener.exitOptField(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitOptField) {
            return visitor.visitOptField(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class MapInitializerListContext extends antlr.ParserRuleContext {
    public _optExpr?: OptExprContext;
    public _keys: OptExprContext[] = [];
    public _s21?: Token | null;
    public _cols: antlr.Token[] = [];
    public _expr?: ExprContext;
    public _values: ExprContext[] = [];
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public optExpr(): OptExprContext[];
    public optExpr(i: number): OptExprContext | null;
    public optExpr(i?: number): OptExprContext[] | OptExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OptExprContext);
        }

        return this.getRuleContext(i, OptExprContext);
    }
    public COLON(): antlr.TerminalNode[];
    public COLON(i: number): antlr.TerminalNode | null;
    public COLON(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COLON);
    	} else {
    		return this.getToken(CELParser.COLON, i);
    	}
    }
    public expr(): ExprContext[];
    public expr(i: number): ExprContext | null;
    public expr(i?: number): ExprContext[] | ExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExprContext);
        }

        return this.getRuleContext(i, ExprContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(CELParser.COMMA);
    	} else {
    		return this.getToken(CELParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_mapInitializerList;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterMapInitializerList) {
             listener.enterMapInitializerList(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitMapInitializerList) {
             listener.exitMapInitializerList(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitMapInitializerList) {
            return visitor.visitMapInitializerList(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class EscapeIdentContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_escapeIdent;
    }
    public override copyFrom(ctx: EscapeIdentContext): void {
        super.copyFrom(ctx);
    }
}
export class SimpleIdentifierContext extends EscapeIdentContext {
    public _id?: Token | null;
    public constructor(ctx: EscapeIdentContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CELParser.IDENTIFIER, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterSimpleIdentifier) {
             listener.enterSimpleIdentifier(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitSimpleIdentifier) {
             listener.exitSimpleIdentifier(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitSimpleIdentifier) {
            return visitor.visitSimpleIdentifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class EscapedIdentifierContext extends EscapeIdentContext {
    public _id?: Token | null;
    public constructor(ctx: EscapeIdentContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public ESC_IDENTIFIER(): antlr.TerminalNode {
        return this.getToken(CELParser.ESC_IDENTIFIER, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterEscapedIdentifier) {
             listener.enterEscapedIdentifier(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitEscapedIdentifier) {
             listener.exitEscapedIdentifier(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitEscapedIdentifier) {
            return visitor.visitEscapedIdentifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class OptExprContext extends antlr.ParserRuleContext {
    public _opt?: Token | null;
    public _e?: ExprContext;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expr(): ExprContext {
        return this.getRuleContext(0, ExprContext)!;
    }
    public QUESTIONMARK(): antlr.TerminalNode | null {
        return this.getToken(CELParser.QUESTIONMARK, 0);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_optExpr;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterOptExpr) {
             listener.enterOptExpr(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitOptExpr) {
             listener.exitOptExpr(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitOptExpr) {
            return visitor.visitOptExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class LiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public override get ruleIndex(): number {
        return CELParser.RULE_literal;
    }
    public override copyFrom(ctx: LiteralContext): void {
        super.copyFrom(ctx);
    }
}
export class IntContext extends LiteralContext {
    public _sign?: Token | null;
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NUM_INT(): antlr.TerminalNode {
        return this.getToken(CELParser.NUM_INT, 0)!;
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.MINUS, 0);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterInt) {
             listener.enterInt(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitInt) {
             listener.exitInt(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitInt) {
            return visitor.visitInt(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class UintContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NUM_UINT(): antlr.TerminalNode {
        return this.getToken(CELParser.NUM_UINT, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterUint) {
             listener.enterUint(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitUint) {
             listener.exitUint(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitUint) {
            return visitor.visitUint(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class DoubleContext extends LiteralContext {
    public _sign?: Token | null;
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NUM_FLOAT(): antlr.TerminalNode {
        return this.getToken(CELParser.NUM_FLOAT, 0)!;
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(CELParser.MINUS, 0);
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterDouble) {
             listener.enterDouble(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitDouble) {
             listener.exitDouble(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitDouble) {
            return visitor.visitDouble(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class StringContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(CELParser.STRING, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterString) {
             listener.enterString(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitString) {
             listener.exitString(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitString) {
            return visitor.visitString(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class BytesContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public BYTES(): antlr.TerminalNode {
        return this.getToken(CELParser.BYTES, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterBytes) {
             listener.enterBytes(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitBytes) {
             listener.exitBytes(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitBytes) {
            return visitor.visitBytes(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class BoolTrueContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public CEL_TRUE(): antlr.TerminalNode {
        return this.getToken(CELParser.CEL_TRUE, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterBoolTrue) {
             listener.enterBoolTrue(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitBoolTrue) {
             listener.exitBoolTrue(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitBoolTrue) {
            return visitor.visitBoolTrue(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class BoolFalseContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public CEL_FALSE(): antlr.TerminalNode {
        return this.getToken(CELParser.CEL_FALSE, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterBoolFalse) {
             listener.enterBoolFalse(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitBoolFalse) {
             listener.exitBoolFalse(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitBoolFalse) {
            return visitor.visitBoolFalse(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
export class NullContext extends LiteralContext {
    public _tok?: Token | null;
    public constructor(ctx: LiteralContext) {
        super(ctx.parent, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public NUL(): antlr.TerminalNode {
        return this.getToken(CELParser.NUL, 0)!;
    }
    public override enterRule(listener: CELListener): void {
        if(listener.enterNull) {
             listener.enterNull(this);
        }
    }
    public override exitRule(listener: CELListener): void {
        if(listener.exitNull) {
             listener.exitNull(this);
        }
    }
    public override accept<Result>(visitor: CELVisitor<Result>): Result | null {
        if (visitor.visitNull) {
            return visitor.visitNull(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
