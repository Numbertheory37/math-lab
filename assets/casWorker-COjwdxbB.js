const e=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`;function t(e){self.postMessage(e)}async function n(){t({type:`progress`,message:`Downloading Python…`});let{loadPyodide:n}=await import(
/* @vite-ignore */
`${e}pyodide.mjs`),r=await n({indexURL:e});t({type:`progress`,message:`Loading SymPy…`}),await r.loadPackage(`sympy`);let i=r.globals.get(`dict`)();return r.runPython(`"""Calculus operations for the solver, run inside Pyodide (Python in the browser).

The TypeScript side calls run_request() with a JSON string and gets a JSON
string back. SymPy does the math, and every answer is checked independently
before it is shown, so a wrong answer is flagged instead of trusted.
"""

import json
import math
import re

import mpmath
import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

X = sympy.Symbol("x", real=True)

MAX_INPUT_LENGTH = 200

# parse_expr evaluates its input as Python, so only characters that math needs
# are allowed. Without quotes, brackets, or underscores, input cannot reach
# anything in Python except SymPy's math functions.
ALLOWED_CHARACTERS = re.compile(r"[A-Za-z0-9\\s+\\-*/^().,]*")

# Textbook names that SymPy spells differently.
NAMES = {
    "x": X,
    "e": sympy.E,
    "pi": sympy.pi,
    "ln": sympy.log,
    "arcsin": sympy.asin,
    "arccos": sympy.acos,
    "arctan": sympy.atan,
    "abs": sympy.Abs,
}

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

# Textbook notation like sin^2(x), which means (sin(x))^2.
FUNCTION_POWER = re.compile(r"\\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log)\\^(\\d+)\\s*\\(")

# Points where answers are checked. They avoid 0, integers, and common
# singularities such as pi/2 so that most functions are defined at most of them.
CHECK_POINTS = (-2.37, -1.29, -0.53, 0.31, 0.87, 1.67, 2.61)
MIN_CHECK_POINTS = 3
CHECK_PRECISION_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")

# Expressions larger than this are not passed to sympy.simplify, which can be slow.
MAX_SIMPLIFY_SIZE = 40

GRAPH_X_MIN = -10.0
GRAPH_X_MAX = 10.0
GRAPH_POINT_COUNT = 801


class InputError(Exception):
    """The user's input cannot be used; the message says why and what to do."""


def find_closing_parenthesis(text, open_index):
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == "(":
            depth += 1
        elif text[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return None


def rewrite_function_powers(text):
    """Rewrite sin^2(x) as (sin(x))^2, which SymPy can parse."""
    while match := FUNCTION_POWER.search(text):
        open_index = match.end() - 1
        close_index = find_closing_parenthesis(text, open_index)
        if close_index is None:
            break  # Unbalanced parentheses; the parser reports the error.
        name, power = match.group(1), match.group(2)
        argument = text[open_index : close_index + 1]
        text = f"{text[: match.start()]}({name}{argument})^{power}{text[close_index + 1 :]}"
    return text


def parse_function(text):
    text = text.strip()
    if not text:
        raise InputError("Type a function of x, such as x^2 sin(x).")
    if len(text) > MAX_INPUT_LENGTH:
        raise InputError(f"That expression is too long (the limit is {MAX_INPUT_LENGTH} characters).")
    if not ALLOWED_CHARACTERS.fullmatch(text):
        raise InputError("Use only letters, digits, spaces, and + - * / ^ ( ) . ,")
    try:
        function = parse_expr(
            rewrite_function_powers(text),
            local_dict=dict(NAMES),
            transformations=TRANSFORMATIONS,
        )
    except Exception as error:  # The parser raises many error types for bad syntax.
        raise InputError("Couldn't read that expression. Check the parentheses and operators.") from error
    if not isinstance(function, sympy.Expr):
        raise InputError("That isn't a function of x. Try something like x^2 sin(x).")
    other_symbols = function.free_symbols - {X}
    if other_symbols:
        names = ", ".join(sorted(str(symbol) for symbol in other_symbols))
        raise InputError(
            f"Use x as the only variable (found {names}). "
            "For a function such as sine, use parentheses: sin(x)."
        )
    if function.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        raise InputError("That expression is undefined, for example because it divides by zero.")
    return function


def to_latex(expression):
    return sympy.latex(expression, ln_notation=True, inv_trig_style="full")


def combine_fractions(expression):
    """Combine fractions when that makes the answer shorter.

    This turns quotient-rule answers like 1/(x+1) - x/(x+1)^2 into 1/(x+1)^2.
    Full simplification is avoided because it rewrites textbook forms, such as
    turning 2 sin(x) cos(x) into sin(2x).
    """
    combined = sympy.together(expression)
    # together() also factors sums with no fractions, like x^2 + 2x(x+1), so
    # only use it when there is a denominator to combine.
    has_denominator = sympy.denom(combined) != 1
    if has_denominator and sympy.count_ops(combined) < sympy.count_ops(expression):
        return combined
    return expression


def real_value(compute):
    """Run compute() and return its value as a real mpf, or None if it is not a finite real number."""
    try:
        value = mpmath.mpmathify(compute())
    except Exception:  # Undefined points raise many error types; all mean "no value here".
        return None
    if isinstance(value, mpmath.mpc):
        if abs(value.imag) > CHECK_TOLERANCE * max(1, abs(value.real)):
            return None
        value = value.real
    if not mpmath.isfinite(value):
        return None
    return value


def compare_at_check_points(expected, actual):
    """Count the check points where expected(x) and actual(x) agree and disagree.

    Points where either side has no real value are skipped.
    """
    agreed = disagreed = 0
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        for point in CHECK_POINTS:
            expected_value = real_value(lambda: expected(mpmath.mpf(point)))
            actual_value = real_value(lambda: actual(mpmath.mpf(point)))
            if expected_value is None or actual_value is None:
                continue
            scale = max(1, abs(expected_value), abs(actual_value))
            if abs(expected_value - actual_value) <= CHECK_TOLERANCE * scale:
                agreed += 1
            else:
                disagreed += 1
    return agreed, disagreed


def numeric_check(agreed, disagreed, verified_detail, failed_detail):
    if disagreed > 0:
        return {"status": "failed", "detail": failed_detail}
    if agreed >= MIN_CHECK_POINTS:
        return {"status": "verified", "detail": verified_detail.format(count=agreed)}
    return {
        "status": "unchecked",
        "detail": "Couldn't test this answer: the function isn't defined at enough test points.",
    }


def numeric_function(expression):
    return sympy.lambdify(X, expression, modules="mpmath")


def check_derivative(function, derivative):
    as_numeric = numeric_function(function)
    agreed, disagreed = compare_at_check_points(
        lambda point: mpmath.diff(as_numeric, point),
        numeric_function(derivative),
    )
    return numeric_check(
        agreed,
        disagreed,
        "Matches a high-precision numerical derivative at {count} test points.",
        "Doesn't match a numerical derivative. Don't trust this answer.",
    )


def check_antiderivative(function, antiderivative):
    derivative = sympy.diff(antiderivative, X)
    difference = derivative - function
    if sympy.count_ops(difference) <= MAX_SIMPLIFY_SIZE and sympy.simplify(difference) == 0:
        return {
            "status": "verified",
            "detail": "Differentiating the answer gives back your function exactly.",
        }
    agreed, disagreed = compare_at_check_points(numeric_function(function), numeric_function(derivative))
    return numeric_check(
        agreed,
        disagreed,
        "Differentiating the answer matches your function at {count} test points.",
        "Differentiating the answer doesn't give back your function. Don't trust this answer.",
    )


def with_absolute_value_logs(expression):
    """Write ln(u) as ln|u|, the textbook form that also holds where u < 0."""
    return expression.replace(
        lambda part: isinstance(part, sympy.log) and not isinstance(part.args[0], sympy.Abs),
        lambda part: sympy.log(sympy.Abs(part.args[0])),
    )


def undefined_where_function_is_defined(function, antiderivative):
    as_numeric = numeric_function(function)
    antiderivative_numeric = numeric_function(antiderivative)
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        return any(
            real_value(lambda: as_numeric(mpmath.mpf(point))) is not None
            and real_value(lambda: antiderivative_numeric(mpmath.mpf(point))) is None
            for point in CHECK_POINTS
        )


def sample_for_graph(expression):
    as_numeric = numeric_function(expression)
    values = []
    for index in range(GRAPH_POINT_COUNT):
        point = GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1)
        value = real_value(lambda: as_numeric(mpmath.mpf(point)))
        number = None if value is None else float(value)
        values.append(number if number is not None and math.isfinite(number) else None)
    return values


def graph_x_values():
    return [
        round(GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1), 6)
        for index in range(GRAPH_POINT_COUNT)
    ]


def solution(operation, function, equation_latex, result, check):
    return {
        "ok": True,
        "operation": operation,
        "equationLatex": equation_latex,
        "resultLatex": to_latex(result),
        "resultText": str(result),
        "check": check,
        "graph": {
            "x": graph_x_values(),
            "input": sample_for_graph(function),
            "result": sample_for_graph(result),
        },
    }


def differentiate(function):
    derivative = combine_fractions(sympy.diff(function, X))
    equation = rf"\\frac{{d}}{{dx}}\\left[{to_latex(function)}\\right] = {to_latex(derivative)}"
    return solution("differentiate", function, equation, derivative, check_derivative(function, derivative))


def integrate(function):
    antiderivative = sympy.integrate(function, X)
    if antiderivative.has(sympy.Integral):
        raise InputError(
            "SymPy couldn't find an antiderivative for this function. "
            "Some functions have none that can be written with standard functions."
        )
    if antiderivative.has(sympy.log) and undefined_where_function_is_defined(function, antiderivative):
        with_absolute_values = with_absolute_value_logs(antiderivative)
        if check_antiderivative(function, with_absolute_values)["status"] == "verified":
            antiderivative = with_absolute_values
    integral = to_latex(sympy.Integral(function, X))
    equation = f"{integral} = {to_latex(antiderivative)} + C"
    return solution("integrate", function, equation, antiderivative, check_antiderivative(function, antiderivative))


OPERATIONS = {"differentiate": differentiate, "integrate": integrate}


def run_request(request_json):
    """Entry point from TypeScript. Takes and returns JSON strings."""
    request = json.loads(request_json)
    try:
        operation = OPERATIONS.get(request.get("operation"))
        if operation is None:
            raise InputError(f"Unknown operation: {request.get('operation')}")
        response = operation(parse_function(request.get("expression", "")))
    except InputError as error:
        response = {"ok": False, "error": str(error)}
    except Exception as error:  # Report any SymPy failure instead of crashing the worker.
        response = {"ok": False, "error": f"SymPy couldn't finish this calculation ({type(error).__name__})."}
    return json.dumps(response, allow_nan=False)
`,{globals:i}),i.get(`run_request`)}const r=n();r.then(()=>t({type:`ready`}),e=>t({type:`loadFailed`,error:String(e)})),self.onmessage=async e=>{let{id:n,operation:i,expression:a}=e.data,o;try{let e=await r;o=JSON.parse(e(JSON.stringify({operation:i,expression:a})))}catch(e){o={ok:!1,error:`The math engine failed: ${String(e)}`}}t({type:`response`,id:n,response:o})};