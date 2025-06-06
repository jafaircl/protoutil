
import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";


export class CELLexer extends antlr.Lexer {
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

    public static readonly channelNames = [
        "DEFAULT_TOKEN_CHANNEL", "HIDDEN"
    ];

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

    public static readonly modeNames = [
        "DEFAULT_MODE",
    ];

    public static readonly ruleNames = [
        "EQUALS", "NOT_EQUALS", "IN", "LESS", "LESS_EQUALS", "GREATER_EQUALS", 
        "GREATER", "LOGICAL_AND", "LOGICAL_OR", "LBRACKET", "RPRACKET", 
        "LBRACE", "RBRACE", "LPAREN", "RPAREN", "DOT", "COMMA", "MINUS", 
        "EXCLAM", "QUESTIONMARK", "COLON", "PLUS", "STAR", "SLASH", "PERCENT", 
        "CEL_TRUE", "CEL_FALSE", "NUL", "BACKSLASH", "LETTER", "DIGIT", 
        "EXPONENT", "HEXDIGIT", "RAW", "ESC_SEQ", "ESC_CHAR_SEQ", "ESC_OCT_SEQ", 
        "ESC_BYTE_SEQ", "ESC_UNI_SEQ", "WHITESPACE", "COMMENT", "NUM_FLOAT", 
        "NUM_INT", "NUM_UINT", "STRING", "BYTES", "IDENTIFIER", "ESC_IDENTIFIER",
    ];


    public constructor(input: antlr.CharStream) {
        super(input);
        this.interpreter = new antlr.LexerATNSimulator(this, CELLexer._ATN, CELLexer.decisionsToDFA, new antlr.PredictionContextCache());
    }

    public get grammarFileName(): string { return "CEL.g4"; }

    public get literalNames(): (string | null)[] { return CELLexer.literalNames; }
    public get symbolicNames(): (string | null)[] { return CELLexer.symbolicNames; }
    public get ruleNames(): string[] { return CELLexer.ruleNames; }

    public get serializedATN(): number[] { return CELLexer._serializedATN; }

    public get channelNames(): string[] { return CELLexer.channelNames; }

    public get modeNames(): string[] { return CELLexer.modeNames; }

    public static readonly _serializedATN: number[] = [
        4,0,37,435,6,-1,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,
        2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,
        13,7,13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,
        19,2,20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,
        26,7,26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,
        32,2,33,7,33,2,34,7,34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,
        39,7,39,2,40,7,40,2,41,7,41,2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,
        45,2,46,7,46,2,47,7,47,1,0,1,0,1,0,1,1,1,1,1,1,1,2,1,2,1,2,1,3,1,
        3,1,4,1,4,1,4,1,5,1,5,1,5,1,6,1,6,1,7,1,7,1,7,1,8,1,8,1,8,1,9,1,
        9,1,10,1,10,1,11,1,11,1,12,1,12,1,13,1,13,1,14,1,14,1,15,1,15,1,
        16,1,16,1,17,1,17,1,18,1,18,1,19,1,19,1,20,1,20,1,21,1,21,1,22,1,
        22,1,23,1,23,1,24,1,24,1,25,1,25,1,25,1,25,1,25,1,26,1,26,1,26,1,
        26,1,26,1,26,1,27,1,27,1,27,1,27,1,27,1,28,1,28,1,29,1,29,1,30,1,
        30,1,31,1,31,3,31,179,8,31,1,31,4,31,182,8,31,11,31,12,31,183,1,
        32,1,32,1,33,1,33,1,34,1,34,1,34,1,34,3,34,194,8,34,1,35,1,35,1,
        35,1,36,1,36,1,36,1,36,1,36,1,37,1,37,1,37,1,37,1,37,1,38,1,38,1,
        38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,38,1,
        38,1,38,1,38,3,38,227,8,38,1,39,4,39,230,8,39,11,39,12,39,231,1,
        39,1,39,1,40,1,40,1,40,1,40,5,40,240,8,40,10,40,12,40,243,9,40,1,
        40,1,40,1,41,4,41,248,8,41,11,41,12,41,249,1,41,1,41,4,41,254,8,
        41,11,41,12,41,255,1,41,3,41,259,8,41,1,41,4,41,262,8,41,11,41,12,
        41,263,1,41,1,41,1,41,1,41,4,41,270,8,41,11,41,12,41,271,1,41,3,
        41,275,8,41,3,41,277,8,41,1,42,4,42,280,8,42,11,42,12,42,281,1,42,
        1,42,1,42,1,42,4,42,288,8,42,11,42,12,42,289,3,42,292,8,42,1,43,
        4,43,295,8,43,11,43,12,43,296,1,43,1,43,1,43,1,43,1,43,1,43,4,43,
        305,8,43,11,43,12,43,306,1,43,1,43,3,43,311,8,43,1,44,1,44,1,44,
        5,44,316,8,44,10,44,12,44,319,9,44,1,44,1,44,1,44,1,44,5,44,325,
        8,44,10,44,12,44,328,9,44,1,44,1,44,1,44,1,44,1,44,1,44,1,44,5,44,
        337,8,44,10,44,12,44,340,9,44,1,44,1,44,1,44,1,44,1,44,1,44,1,44,
        1,44,1,44,5,44,351,8,44,10,44,12,44,354,9,44,1,44,1,44,1,44,1,44,
        1,44,1,44,5,44,362,8,44,10,44,12,44,365,9,44,1,44,1,44,1,44,1,44,
        1,44,5,44,372,8,44,10,44,12,44,375,9,44,1,44,1,44,1,44,1,44,1,44,
        1,44,1,44,1,44,5,44,385,8,44,10,44,12,44,388,9,44,1,44,1,44,1,44,
        1,44,1,44,1,44,1,44,1,44,1,44,1,44,5,44,400,8,44,10,44,12,44,403,
        9,44,1,44,1,44,1,44,1,44,3,44,409,8,44,1,45,1,45,1,45,1,46,1,46,
        3,46,416,8,46,1,46,1,46,1,46,5,46,421,8,46,10,46,12,46,424,9,46,
        1,47,1,47,1,47,1,47,4,47,430,8,47,11,47,12,47,431,1,47,1,47,4,338,
        352,386,401,0,48,1,1,3,2,5,3,7,4,9,5,11,6,13,7,15,8,17,9,19,10,21,
        11,23,12,25,13,27,14,29,15,31,16,33,17,35,18,37,19,39,20,41,21,43,
        22,45,23,47,24,49,25,51,26,53,27,55,28,57,0,59,0,61,0,63,0,65,0,
        67,0,69,0,71,0,73,0,75,0,77,0,79,29,81,30,83,31,85,32,87,33,89,34,
        91,35,93,36,95,37,1,0,17,2,0,65,90,97,122,2,0,69,69,101,101,2,0,
        43,43,45,45,3,0,48,57,65,70,97,102,2,0,82,82,114,114,10,0,34,34,
        39,39,63,63,92,92,96,98,102,102,110,110,114,114,116,116,118,118,
        2,0,88,88,120,120,3,0,9,10,12,13,32,32,1,0,10,10,2,0,85,85,117,117,
        4,0,10,10,13,13,34,34,92,92,4,0,10,10,13,13,39,39,92,92,1,0,92,92,
        3,0,10,10,13,13,34,34,3,0,10,10,13,13,39,39,2,0,66,66,98,98,3,0,
        32,32,45,47,95,95,471,0,1,1,0,0,0,0,3,1,0,0,0,0,5,1,0,0,0,0,7,1,
        0,0,0,0,9,1,0,0,0,0,11,1,0,0,0,0,13,1,0,0,0,0,15,1,0,0,0,0,17,1,
        0,0,0,0,19,1,0,0,0,0,21,1,0,0,0,0,23,1,0,0,0,0,25,1,0,0,0,0,27,1,
        0,0,0,0,29,1,0,0,0,0,31,1,0,0,0,0,33,1,0,0,0,0,35,1,0,0,0,0,37,1,
        0,0,0,0,39,1,0,0,0,0,41,1,0,0,0,0,43,1,0,0,0,0,45,1,0,0,0,0,47,1,
        0,0,0,0,49,1,0,0,0,0,51,1,0,0,0,0,53,1,0,0,0,0,55,1,0,0,0,0,79,1,
        0,0,0,0,81,1,0,0,0,0,83,1,0,0,0,0,85,1,0,0,0,0,87,1,0,0,0,0,89,1,
        0,0,0,0,91,1,0,0,0,0,93,1,0,0,0,0,95,1,0,0,0,1,97,1,0,0,0,3,100,
        1,0,0,0,5,103,1,0,0,0,7,106,1,0,0,0,9,108,1,0,0,0,11,111,1,0,0,0,
        13,114,1,0,0,0,15,116,1,0,0,0,17,119,1,0,0,0,19,122,1,0,0,0,21,124,
        1,0,0,0,23,126,1,0,0,0,25,128,1,0,0,0,27,130,1,0,0,0,29,132,1,0,
        0,0,31,134,1,0,0,0,33,136,1,0,0,0,35,138,1,0,0,0,37,140,1,0,0,0,
        39,142,1,0,0,0,41,144,1,0,0,0,43,146,1,0,0,0,45,148,1,0,0,0,47,150,
        1,0,0,0,49,152,1,0,0,0,51,154,1,0,0,0,53,159,1,0,0,0,55,165,1,0,
        0,0,57,170,1,0,0,0,59,172,1,0,0,0,61,174,1,0,0,0,63,176,1,0,0,0,
        65,185,1,0,0,0,67,187,1,0,0,0,69,193,1,0,0,0,71,195,1,0,0,0,73,198,
        1,0,0,0,75,203,1,0,0,0,77,226,1,0,0,0,79,229,1,0,0,0,81,235,1,0,
        0,0,83,276,1,0,0,0,85,291,1,0,0,0,87,310,1,0,0,0,89,408,1,0,0,0,
        91,410,1,0,0,0,93,415,1,0,0,0,95,425,1,0,0,0,97,98,5,61,0,0,98,99,
        5,61,0,0,99,2,1,0,0,0,100,101,5,33,0,0,101,102,5,61,0,0,102,4,1,
        0,0,0,103,104,5,105,0,0,104,105,5,110,0,0,105,6,1,0,0,0,106,107,
        5,60,0,0,107,8,1,0,0,0,108,109,5,60,0,0,109,110,5,61,0,0,110,10,
        1,0,0,0,111,112,5,62,0,0,112,113,5,61,0,0,113,12,1,0,0,0,114,115,
        5,62,0,0,115,14,1,0,0,0,116,117,5,38,0,0,117,118,5,38,0,0,118,16,
        1,0,0,0,119,120,5,124,0,0,120,121,5,124,0,0,121,18,1,0,0,0,122,123,
        5,91,0,0,123,20,1,0,0,0,124,125,5,93,0,0,125,22,1,0,0,0,126,127,
        5,123,0,0,127,24,1,0,0,0,128,129,5,125,0,0,129,26,1,0,0,0,130,131,
        5,40,0,0,131,28,1,0,0,0,132,133,5,41,0,0,133,30,1,0,0,0,134,135,
        5,46,0,0,135,32,1,0,0,0,136,137,5,44,0,0,137,34,1,0,0,0,138,139,
        5,45,0,0,139,36,1,0,0,0,140,141,5,33,0,0,141,38,1,0,0,0,142,143,
        5,63,0,0,143,40,1,0,0,0,144,145,5,58,0,0,145,42,1,0,0,0,146,147,
        5,43,0,0,147,44,1,0,0,0,148,149,5,42,0,0,149,46,1,0,0,0,150,151,
        5,47,0,0,151,48,1,0,0,0,152,153,5,37,0,0,153,50,1,0,0,0,154,155,
        5,116,0,0,155,156,5,114,0,0,156,157,5,117,0,0,157,158,5,101,0,0,
        158,52,1,0,0,0,159,160,5,102,0,0,160,161,5,97,0,0,161,162,5,108,
        0,0,162,163,5,115,0,0,163,164,5,101,0,0,164,54,1,0,0,0,165,166,5,
        110,0,0,166,167,5,117,0,0,167,168,5,108,0,0,168,169,5,108,0,0,169,
        56,1,0,0,0,170,171,5,92,0,0,171,58,1,0,0,0,172,173,7,0,0,0,173,60,
        1,0,0,0,174,175,2,48,57,0,175,62,1,0,0,0,176,178,7,1,0,0,177,179,
        7,2,0,0,178,177,1,0,0,0,178,179,1,0,0,0,179,181,1,0,0,0,180,182,
        3,61,30,0,181,180,1,0,0,0,182,183,1,0,0,0,183,181,1,0,0,0,183,184,
        1,0,0,0,184,64,1,0,0,0,185,186,7,3,0,0,186,66,1,0,0,0,187,188,7,
        4,0,0,188,68,1,0,0,0,189,194,3,71,35,0,190,194,3,75,37,0,191,194,
        3,77,38,0,192,194,3,73,36,0,193,189,1,0,0,0,193,190,1,0,0,0,193,
        191,1,0,0,0,193,192,1,0,0,0,194,70,1,0,0,0,195,196,3,57,28,0,196,
        197,7,5,0,0,197,72,1,0,0,0,198,199,3,57,28,0,199,200,2,48,51,0,200,
        201,2,48,55,0,201,202,2,48,55,0,202,74,1,0,0,0,203,204,3,57,28,0,
        204,205,7,6,0,0,205,206,3,65,32,0,206,207,3,65,32,0,207,76,1,0,0,
        0,208,209,3,57,28,0,209,210,5,117,0,0,210,211,3,65,32,0,211,212,
        3,65,32,0,212,213,3,65,32,0,213,214,3,65,32,0,214,227,1,0,0,0,215,
        216,3,57,28,0,216,217,5,85,0,0,217,218,3,65,32,0,218,219,3,65,32,
        0,219,220,3,65,32,0,220,221,3,65,32,0,221,222,3,65,32,0,222,223,
        3,65,32,0,223,224,3,65,32,0,224,225,3,65,32,0,225,227,1,0,0,0,226,
        208,1,0,0,0,226,215,1,0,0,0,227,78,1,0,0,0,228,230,7,7,0,0,229,228,
        1,0,0,0,230,231,1,0,0,0,231,229,1,0,0,0,231,232,1,0,0,0,232,233,
        1,0,0,0,233,234,6,39,0,0,234,80,1,0,0,0,235,236,5,47,0,0,236,237,
        5,47,0,0,237,241,1,0,0,0,238,240,8,8,0,0,239,238,1,0,0,0,240,243,
        1,0,0,0,241,239,1,0,0,0,241,242,1,0,0,0,242,244,1,0,0,0,243,241,
        1,0,0,0,244,245,6,40,0,0,245,82,1,0,0,0,246,248,3,61,30,0,247,246,
        1,0,0,0,248,249,1,0,0,0,249,247,1,0,0,0,249,250,1,0,0,0,250,251,
        1,0,0,0,251,253,5,46,0,0,252,254,3,61,30,0,253,252,1,0,0,0,254,255,
        1,0,0,0,255,253,1,0,0,0,255,256,1,0,0,0,256,258,1,0,0,0,257,259,
        3,63,31,0,258,257,1,0,0,0,258,259,1,0,0,0,259,277,1,0,0,0,260,262,
        3,61,30,0,261,260,1,0,0,0,262,263,1,0,0,0,263,261,1,0,0,0,263,264,
        1,0,0,0,264,265,1,0,0,0,265,266,3,63,31,0,266,277,1,0,0,0,267,269,
        5,46,0,0,268,270,3,61,30,0,269,268,1,0,0,0,270,271,1,0,0,0,271,269,
        1,0,0,0,271,272,1,0,0,0,272,274,1,0,0,0,273,275,3,63,31,0,274,273,
        1,0,0,0,274,275,1,0,0,0,275,277,1,0,0,0,276,247,1,0,0,0,276,261,
        1,0,0,0,276,267,1,0,0,0,277,84,1,0,0,0,278,280,3,61,30,0,279,278,
        1,0,0,0,280,281,1,0,0,0,281,279,1,0,0,0,281,282,1,0,0,0,282,292,
        1,0,0,0,283,284,5,48,0,0,284,285,5,120,0,0,285,287,1,0,0,0,286,288,
        3,65,32,0,287,286,1,0,0,0,288,289,1,0,0,0,289,287,1,0,0,0,289,290,
        1,0,0,0,290,292,1,0,0,0,291,279,1,0,0,0,291,283,1,0,0,0,292,86,1,
        0,0,0,293,295,3,61,30,0,294,293,1,0,0,0,295,296,1,0,0,0,296,294,
        1,0,0,0,296,297,1,0,0,0,297,298,1,0,0,0,298,299,7,9,0,0,299,311,
        1,0,0,0,300,301,5,48,0,0,301,302,5,120,0,0,302,304,1,0,0,0,303,305,
        3,65,32,0,304,303,1,0,0,0,305,306,1,0,0,0,306,304,1,0,0,0,306,307,
        1,0,0,0,307,308,1,0,0,0,308,309,7,9,0,0,309,311,1,0,0,0,310,294,
        1,0,0,0,310,300,1,0,0,0,311,88,1,0,0,0,312,317,5,34,0,0,313,316,
        3,69,34,0,314,316,8,10,0,0,315,313,1,0,0,0,315,314,1,0,0,0,316,319,
        1,0,0,0,317,315,1,0,0,0,317,318,1,0,0,0,318,320,1,0,0,0,319,317,
        1,0,0,0,320,409,5,34,0,0,321,326,5,39,0,0,322,325,3,69,34,0,323,
        325,8,11,0,0,324,322,1,0,0,0,324,323,1,0,0,0,325,328,1,0,0,0,326,
        324,1,0,0,0,326,327,1,0,0,0,327,329,1,0,0,0,328,326,1,0,0,0,329,
        409,5,39,0,0,330,331,5,34,0,0,331,332,5,34,0,0,332,333,5,34,0,0,
        333,338,1,0,0,0,334,337,3,69,34,0,335,337,8,12,0,0,336,334,1,0,0,
        0,336,335,1,0,0,0,337,340,1,0,0,0,338,339,1,0,0,0,338,336,1,0,0,
        0,339,341,1,0,0,0,340,338,1,0,0,0,341,342,5,34,0,0,342,343,5,34,
        0,0,343,409,5,34,0,0,344,345,5,39,0,0,345,346,5,39,0,0,346,347,5,
        39,0,0,347,352,1,0,0,0,348,351,3,69,34,0,349,351,8,12,0,0,350,348,
        1,0,0,0,350,349,1,0,0,0,351,354,1,0,0,0,352,353,1,0,0,0,352,350,
        1,0,0,0,353,355,1,0,0,0,354,352,1,0,0,0,355,356,5,39,0,0,356,357,
        5,39,0,0,357,409,5,39,0,0,358,359,3,67,33,0,359,363,5,34,0,0,360,
        362,8,13,0,0,361,360,1,0,0,0,362,365,1,0,0,0,363,361,1,0,0,0,363,
        364,1,0,0,0,364,366,1,0,0,0,365,363,1,0,0,0,366,367,5,34,0,0,367,
        409,1,0,0,0,368,369,3,67,33,0,369,373,5,39,0,0,370,372,8,14,0,0,
        371,370,1,0,0,0,372,375,1,0,0,0,373,371,1,0,0,0,373,374,1,0,0,0,
        374,376,1,0,0,0,375,373,1,0,0,0,376,377,5,39,0,0,377,409,1,0,0,0,
        378,379,3,67,33,0,379,380,5,34,0,0,380,381,5,34,0,0,381,382,5,34,
        0,0,382,386,1,0,0,0,383,385,9,0,0,0,384,383,1,0,0,0,385,388,1,0,
        0,0,386,387,1,0,0,0,386,384,1,0,0,0,387,389,1,0,0,0,388,386,1,0,
        0,0,389,390,5,34,0,0,390,391,5,34,0,0,391,392,5,34,0,0,392,409,1,
        0,0,0,393,394,3,67,33,0,394,395,5,39,0,0,395,396,5,39,0,0,396,397,
        5,39,0,0,397,401,1,0,0,0,398,400,9,0,0,0,399,398,1,0,0,0,400,403,
        1,0,0,0,401,402,1,0,0,0,401,399,1,0,0,0,402,404,1,0,0,0,403,401,
        1,0,0,0,404,405,5,39,0,0,405,406,5,39,0,0,406,407,5,39,0,0,407,409,
        1,0,0,0,408,312,1,0,0,0,408,321,1,0,0,0,408,330,1,0,0,0,408,344,
        1,0,0,0,408,358,1,0,0,0,408,368,1,0,0,0,408,378,1,0,0,0,408,393,
        1,0,0,0,409,90,1,0,0,0,410,411,7,15,0,0,411,412,3,89,44,0,412,92,
        1,0,0,0,413,416,3,59,29,0,414,416,5,95,0,0,415,413,1,0,0,0,415,414,
        1,0,0,0,416,422,1,0,0,0,417,421,3,59,29,0,418,421,3,61,30,0,419,
        421,5,95,0,0,420,417,1,0,0,0,420,418,1,0,0,0,420,419,1,0,0,0,421,
        424,1,0,0,0,422,420,1,0,0,0,422,423,1,0,0,0,423,94,1,0,0,0,424,422,
        1,0,0,0,425,429,5,96,0,0,426,430,3,59,29,0,427,430,3,61,30,0,428,
        430,7,16,0,0,429,426,1,0,0,0,429,427,1,0,0,0,429,428,1,0,0,0,430,
        431,1,0,0,0,431,429,1,0,0,0,431,432,1,0,0,0,432,433,1,0,0,0,433,
        434,5,96,0,0,434,96,1,0,0,0,38,0,178,183,193,226,231,241,249,255,
        258,263,271,274,276,281,289,291,296,306,310,315,317,324,326,336,
        338,350,352,363,373,386,401,408,415,420,422,429,431,1,0,1,0
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!CELLexer.__ATN) {
            CELLexer.__ATN = new antlr.ATNDeserializer().deserialize(CELLexer._serializedATN);
        }

        return CELLexer.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(CELLexer.literalNames, CELLexer.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return CELLexer.vocabulary;
    }

    private static readonly decisionsToDFA = CELLexer._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}