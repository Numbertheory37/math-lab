const e=/* #__PURE__ */ Object.assign({"./python/mathlab/__init__.py":`"""Math Lab's Python side: SymPy-based calculus with checks and explanations."""
`,"./python/mathlab/calculus.py":`"""Calculus operations for the solver, run inside Pyodide (Python in the browser).

The TypeScript side calls run_request() with a JSON string and gets a JSON
string back. SymPy does the math, every answer is checked independently
before it is shown, and answers come with step-by-step explanations when the
rules taught in calculus courses can produce them.
"""

import json

import mpmath
import sympy

from mathlab.checks import (
    check_antiderivative,
    check_derivative,
    check_with_constants,
    numeric_function,
    plot_value,
    test_values,
    undefined_where_function_is_defined,
)
from mathlab.derivative_steps import derivative_with_steps
from mathlab.expressions import X, Y, InputError, to_latex, with_absolute_value_logs
from mathlab.integral_steps import MAX_STEP_COUNT, explain_integral, find_integral_rule, rule_count
from mathlab.integral_strategies import integrate_with_one_angle
from mathlab.latex_input import latex_to_text
from mathlab.progress import listen, report
from mathlab.multivariable import parse_point, partial_derivatives
from mathlab.parsing import constants_in, parse_function

GRAPH_X_MIN = -10.0
GRAPH_X_MAX = 10.0
GRAPH_POINT_COUNT = 801


def sample_for_graph(expression):
    as_numeric = numeric_function(expression)
    values = []
    for index in range(GRAPH_POINT_COUNT):
        point = GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1)
        values.append(plot_value(lambda: as_numeric(mpmath.mpf(point))))
    return values


def graph_x_values():
    return [
        round(GRAPH_X_MIN + (GRAPH_X_MAX - GRAPH_X_MIN) * index / (GRAPH_POINT_COUNT - 1), 6)
        for index in range(GRAPH_POINT_COUNT)
    ]


def solution(operation, function, equation_latex, result, check, steps, steps_note):
    constants = constants_in(function, (X,))
    # With constants like a and b there is no single curve to draw.
    graph = None
    if not constants:
        graph = {
            "x": graph_x_values(),
            "input": sample_for_graph(function),
            "result": sample_for_graph(result),
        }
    return {
        "ok": True,
        "operation": operation,
        "equationLatex": equation_latex,
        "resultLatex": to_latex(result),
        "resultText": str(result),
        "constants": [to_latex(constant) for constant in constants],
        "check": check,
        "steps": steps,
        "stepsNote": steps_note,
        "graph": graph,
    }


def differentiate(function):
    derivative, steps, steps_note = derivative_with_steps(function)
    equation = rf"\\frac{{d}}{{dx}}\\left[{to_latex(function)}\\right] = {to_latex(derivative)}"
    check = check_with_constants(check_derivative, function, derivative)
    return solution("differentiate", function, equation, derivative, check, steps, steps_note)


def with_absolute_values_if_needed(function, antiderivative):
    """Use ln|u| instead of ln(u) where ln(u) is undefined but the function is not.

    Returns the antiderivative to show and whether absolute values were added.
    """
    if not antiderivative.has(sympy.log):
        return antiderivative, False
    values = test_values(constants_in(function, (X,)))
    if not undefined_where_function_is_defined(function.subs(values), antiderivative.subs(values)):
        return antiderivative, False
    candidate = with_absolute_value_logs(antiderivative)
    if check_with_constants(check_antiderivative, function, candidate)["status"] == "verified":
        return candidate, True
    return antiderivative, False


def integral_solution(function, antiderivative, check, steps, steps_note):
    equation = f"{to_latex(sympy.Integral(function, X))} = {to_latex(antiderivative)} + C"
    return solution("integrate", function, equation, antiderivative, check, steps, steps_note)


def integrate(function):
    """Try strategies from the most explainable to the most powerful, reporting
    each one, since hard integrals can take minutes."""
    report("Trying the textbook rules (substitution, parts, partial fractions)…")
    found = find_integral_rule(function, X)
    if found is not None:
        rule, antiderivative = found
        antiderivative, absolute_logs = with_absolute_values_if_needed(function, antiderivative)
        check = check_with_constants(check_antiderivative, function, antiderivative)
        if check["status"] != "failed":
            if rule_count(rule) > MAX_STEP_COUNT:
                return integral_solution(
                    function, antiderivative, check, [], "This solution has too many steps to show."
                )
            try:
                steps, steps_note = explain_integral(rule, absolute_logs), None
            except Exception:  # Steps are extra: a failure in them must not block the answer.
                steps, steps_note = [], "Steps couldn't be shown for this integral."
            return integral_solution(function, antiderivative, check, steps, steps_note)
    report("Rewriting the trig functions in terms of one angle…")
    rewritten = integrate_with_one_angle(function)
    if rewritten is not None:
        antiderivative, steps = rewritten
        antiderivative, _ = with_absolute_values_if_needed(function, antiderivative)
        check = check_with_constants(check_antiderivative, function, antiderivative)
        if check["status"] != "failed":
            return integral_solution(function, antiderivative, check, steps, None)
    report("Trying SymPy's general algorithms (Risch, Meijer G). Hard integrals can take minutes…")
    antiderivative = sympy.integrate(function, X)
    if antiderivative.has(sympy.Integral):
        raise InputError(
            "SymPy couldn't find an antiderivative for this function. "
            "Some functions have none that can be written with standard functions."
        )
    antiderivative, _ = with_absolute_values_if_needed(function, antiderivative)
    return integral_solution(
        function,
        antiderivative,
        check_with_constants(check_antiderivative, function, antiderivative),
        [],
        "Steps aren't available: SymPy found this antiderivative with an advanced algorithm "
        "rather than the rules taught in calculus courses.",
    )


def expression_text(request):
    """The request's expression as plain text. The math input box sends LaTeX."""
    expression = request.get("expression", "")
    return latex_to_text(expression) if request.get("format") == "latex" else expression


def preview(request):
    """How the input reads as math, shown while the student types."""
    variables = (X, Y) if request.get("variables") == ["x", "y"] else (X,)
    function = parse_function(expression_text(request), variables)
    return {
        "ok": True,
        "operation": "preview",
        "latex": to_latex(function),
        "constants": [to_latex(constant) for constant in constants_in(function, variables)],
    }


OPERATIONS = {
    "preview": preview,
    "differentiate": lambda request: differentiate(parse_function(expression_text(request))),
    "integrate": lambda request: integrate(parse_function(expression_text(request))),
    "partial": lambda request: partial_derivatives(
        parse_function(expression_text(request), (X, Y)), parse_point(request.get("point"))
    ),
}


def run_request(request_json, on_progress=None):
    """Entry point from TypeScript. Takes and returns JSON strings.

    on_progress, if given, is called with short messages about what a long
    calculation is trying.
    """
    request = json.loads(request_json)
    listen(on_progress)
    try:
        operation = OPERATIONS.get(request.get("operation"))
        if operation is None:
            raise InputError(f"Unknown operation: {request.get('operation')}")
        response = operation(request)
    except InputError as error:
        response = {"ok": False, "error": str(error)}
    except Exception as error:  # Report any SymPy failure instead of crashing the worker.
        response = {"ok": False, "error": f"SymPy couldn't finish this calculation ({type(error).__name__})."}
    finally:
        listen(None)
    return json.dumps(response, allow_nan=False)
`,"./python/mathlab/checks.py":`"""Independent numerical checks of answers, so a wrong answer is flagged."""

import itertools
import math

import mpmath
import sympy

from mathlab.expressions import X, Y, to_latex

# Points where answers are checked. They avoid 0, integers, and common
# singularities such as pi/2 so that most functions are defined at most of them.
CHECK_POINTS = (-2.37, -1.29, -0.53, 0.31, 0.87, 1.67, 2.61)
# (x, y) points for functions of two variables, in all four quadrants.
CHECK_POINTS_2D = tuple(zip(CHECK_POINTS, (1.13, -0.71, 2.07, -1.83, 0.47, -2.29, 1.59)))
MIN_CHECK_POINTS = 3
CHECK_PRECISION_DIGITS = 30
CHECK_TOLERANCE = mpmath.mpf("1e-12")

# Values tried for constants like a and b. Checks need numbers, so an answer
# with constants is checked with these plugged in. They avoid 0 and 1, which
# can hide mistakes.
CONSTANT_TEST_VALUES = (1.37, 0.73, 2.19, 1.61, 0.58, 2.83, 1.17, 0.91)

# Expressions larger than this are not passed to sympy.simplify, which can be slow.
MAX_SIMPLIFY_SIZE = 40


def test_values(constants):
    """Numbers to substitute for constants (in order), for checking answers."""
    return {
        constant: sympy.Rational(str(value))
        for constant, value in zip(constants, itertools.cycle(CONSTANT_TEST_VALUES))
    }


def check_with_constants(check, function, result, variables=(X,)):
    """Run check(function, result). Checks need numbers, so any constants
    (like a and b) get test values, and the detail says which."""
    constants = sorted(function.free_symbols - set(variables), key=str)
    if not constants:
        return check(function, result)
    values = test_values(constants)
    outcome = check(function.subs(values), result.subs(values))
    settings = ", ".join(f"\${to_latex(constant)} = {float(value):g}$" for constant, value in values.items())
    return {**outcome, "detail": f"{outcome['detail']} (Checked with {settings}.)"}


def numeric_function(expression, variables=(X,)):
    return sympy.lambdify(variables, expression, modules="mpmath")


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


def check_points_for(variables):
    return CHECK_POINTS_2D if len(variables) == 2 else tuple((point,) for point in CHECK_POINTS)


def plot_value(compute):
    """compute()'s value as a float for a graph, or None where there is no real value."""
    value = real_value(compute)
    if value is None:
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def compare_at_check_points(expected, actual, variables=(X,)):
    """Count the check points where expected and actual agree and disagree.

    Both are numeric functions of the variables. Points where either side has
    no real value are skipped.
    """
    agreed = disagreed = 0
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        for point in check_points_for(variables):
            coordinates = [mpmath.mpf(coordinate) for coordinate in point]
            expected_value = real_value(lambda: expected(*coordinates))
            actual_value = real_value(lambda: actual(*coordinates))
            if expected_value is None or actual_value is None:
                continue
            scale = max(1, abs(expected_value), abs(actual_value))
            if abs(expected_value - actual_value) <= CHECK_TOLERANCE * scale:
                agreed += 1
            else:
                disagreed += 1
    return agreed, disagreed


def agree_numerically(first, second, variables=(X,)):
    """True when two expressions have the same value at every check point."""
    _, disagreed = compare_at_check_points(
        numeric_function(first, variables), numeric_function(second, variables), variables
    )
    return disagreed == 0


def numeric_check(agreed, disagreed, verified_detail, failed_detail):
    if disagreed > 0:
        return {"status": "failed", "detail": failed_detail}
    if agreed >= MIN_CHECK_POINTS:
        return {"status": "verified", "detail": verified_detail.format(count=agreed)}
    return {
        "status": "unchecked",
        "detail": "Couldn't test this answer: the function isn't defined at enough test points.",
    }


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


def check_partial_derivative(function, derivative, variable):
    """Compare with a numerical partial derivative: vary one coordinate, hold the other."""
    variables = (X, Y)
    index = variables.index(variable)
    as_numeric = numeric_function(function, variables)

    def numerical_partial(*point):
        def along_variable(value):
            coordinates = list(point)
            coordinates[index] = value
            return as_numeric(*coordinates)

        return mpmath.diff(along_variable, point[index])

    agreed, disagreed = compare_at_check_points(
        numerical_partial, numeric_function(derivative, variables), variables
    )
    return numeric_check(
        agreed,
        disagreed,
        "Matches a high-precision numerical partial derivative at {count} test points.",
        "Doesn't match a numerical partial derivative. Don't trust this answer.",
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


def undefined_where_function_is_defined(function, antiderivative):
    as_numeric = numeric_function(function)
    antiderivative_numeric = numeric_function(antiderivative)
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        return any(
            real_value(lambda: as_numeric(mpmath.mpf(point))) is not None
            and real_value(lambda: antiderivative_numeric(mpmath.mpf(point))) is None
            for point in CHECK_POINTS
        )
`,"./python/mathlab/derivative_steps.py":`"""Step-by-step derivatives, using the rules taught in Calculus I.

explain_derivative() returns a derivative together with the step that
explains it. Each rule computes its result from its own formula (for example
u'v + uv' for a product), so the steps and the answer always match. The
calculus module double-checks the result against SymPy's diff().

The same rules give partial derivatives: differentiating x^2 y with respect
to x treats y as a constant, exactly as a student does by hand.
"""

from dataclasses import dataclass

import sympy

from mathlab.checks import agree_numerically, test_values
from mathlab.expressions import X, factor_latex, power_base_latex, to_latex
from mathlab.steps import make_step

# The inner variable of the chain rule. It is real so that the derivative of
# |u| is sign(u) rather than a formula for complex numbers.
U = sympy.Dummy("u", real=True)

FUNCTION_NAMES = {
    sympy.sin: "sine",
    sympy.cos: "cosine",
    sympy.tan: "tangent",
    sympy.sec: "secant",
    sympy.csc: "cosecant",
    sympy.cot: "cotangent",
    sympy.exp: "eˣ",
    sympy.log: "ln",
    sympy.asin: "arcsine",
    sympy.acos: "arccosine",
    sympy.atan: "arctangent",
    sympy.sinh: "sinh",
    sympy.cosh: "cosh",
    sympy.tanh: "tanh",
    sympy.Abs: "absolute value",
}

CHAIN_RULE_ADVICE = (
    "Differentiate the outside, keep the inside as it is, then multiply by the derivative of the inside."
)


@dataclass(frozen=True)
class Differentiation:
    """What to differentiate with respect to, and whether it is a partial derivative."""

    variable: sympy.Symbol = X
    partial: bool = False

    @property
    def name(self):
        return to_latex(self.variable)

    def of(self, expression):
        """LaTeX for the derivative operator applied to expression, like d/dx[...]."""
        if self.partial:
            operator = rf"\\frac{{\\partial}}{{\\partial {self.name}}}"
        else:
            operator = rf"\\frac{{d}}{{d{self.name}}}"
        return rf"{operator}\\left[{to_latex(expression)}\\right]"


ORDINARY = Differentiation()


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


def derivative_with_steps(function, d=ORDINARY, variables=(X,)):
    """Return (derivative, steps, steps_note) for the derivative described by d.

    If the step-by-step rules fail or disagree with SymPy's diff(), SymPy's
    answer is used without steps, and steps_note says so.
    """
    sympy_derivative = sympy.diff(function, d.variable)
    values = test_values(sorted(function.free_symbols - set(variables), key=str))
    try:
        derivative, step = explain_derivative(function, d)
        explained = agree_numerically(derivative.subs(values), sympy_derivative.subs(values), variables)
    except Exception:  # Steps are extra: a failure in them must not block the answer.
        explained = False
    if explained:
        steps, steps_note = [step], None
    else:
        derivative = sympy_derivative
        steps, steps_note = [], "Steps aren't available for this derivative."
    combined = combine_fractions(derivative)
    if combined != derivative and steps:
        steps.append(
            make_step(
                "Simplify",
                "Combine the fractions into a single fraction.",
                [to_latex(derivative), to_latex(combined)],
            )
        )
    return combined, steps, steps_note


def explain_derivative(function, d=ORDINARY):
    """Return (derivative, step) for the derivative of function described by d."""
    if not function.has(d.variable):
        return constant_rule(function, d)
    if function == d.variable:
        return sympy.Integer(1), make_step(
            f"Derivative of {d.name}",
            rf"The rate of change of \${d.name}$ with respect to itself is $1$.",
            [d.of(function), "1"],
        )
    if isinstance(function, sympy.Add):
        return sum_rule(function, d)
    if isinstance(function, sympy.Mul):
        return product_or_quotient_rule(function, d)
    if isinstance(function, sympy.Pow):
        return power_rule(function, d)
    if isinstance(function, sympy.Function) and len(function.args) == 1:
        return function_rule(function, d)
    derivative = sympy.diff(function, d.variable)
    return derivative, make_step(
        "Derivative",
        "SymPy computed this derivative directly; none of the basic rules applies.",
        [d.of(function), to_latex(derivative)],
    )


def explain_part(expression, d):
    """Like explain_derivative, but leaves out steps for linear expressions such as
    x + 1 or 3x, whose derivatives are obvious."""
    derivative, step = explain_derivative(expression, d)
    is_linear = expression.is_polynomial(d.variable) and sympy.degree(expression, d.variable) <= 1
    return derivative, None if is_linear else step


def constant_rule(function, d):
    if d.partial and function.free_symbols:
        explanation = (
            rf"\${to_latex(function)}$ doesn't contain \${d.name}$, so it is treated as a "
            "constant, and its derivative is $0$."
        )
    else:
        explanation = "A constant never changes, so its derivative is $0$."
    return sympy.Integer(0), make_step("Constant rule", explanation, [d.of(function), "0"])


def sum_rule(function, d):
    terms = function.as_ordered_terms()
    parts = [explain_part(term, d) for term in terms]
    derivative = sympy.Add(*(term_derivative for term_derivative, _ in parts))
    return derivative, make_step(
        "Sum rule",
        "Differentiate each term separately, then add the results.",
        [d.of(function), " + ".join(d.of(term) for term in terms), to_latex(derivative)],
        [step for _, step in parts],
    )


def product_or_quotient_rule(function, d):
    constant, rest = function.as_independent(d.variable, as_Add=False)
    if constant != 1:
        return constant_multiple_rule(constant, rest, function, d)
    factors = function.as_ordered_factors()
    denominators = [
        factor for factor in factors if isinstance(factor, sympy.Pow) and factor.exp.is_negative
    ]
    numerators = [factor for factor in factors if factor not in denominators]
    if denominators and numerators:
        numerator = sympy.Mul(*numerators)
        denominator = sympy.Mul(*(1 / factor for factor in denominators))
        return quotient_rule(numerator, denominator, function, d)
    first, *others = factors
    return product_rule(first, sympy.Mul(*others), function, d)


def constant_multiple_rule(constant, rest, function, d):
    rest_derivative, rest_step = explain_part(rest, d)
    derivative = constant * rest_derivative
    if d.partial and constant.free_symbols:
        explanation = (
            rf"\${to_latex(constant)}$ doesn't contain \${d.name}$, so treat it as a constant "
            "factor and differentiate the rest."
        )
    else:
        explanation = f"Keep the constant \${to_latex(constant)}$ and differentiate the rest."
    return derivative, make_step(
        "Constant multiple rule",
        explanation,
        [d.of(function), rf"{factor_latex(constant)} \\cdot {d.of(rest)}", to_latex(derivative)],
        [rest_step],
    )


def product_rule(first, second, function, d):
    first_derivative, first_step = explain_part(first, d)
    second_derivative, second_step = explain_part(second, d)
    derivative = first_derivative * second + first * second_derivative
    return derivative, make_step(
        "Product rule",
        rf"For a product $uv$, $(uv)' = u'v + uv'$. Here $u = {to_latex(first)}$ "
        rf"and $v = {to_latex(second)}$.",
        [
            d.of(function),
            rf"{d.of(first)} \\cdot {factor_latex(second)} + {factor_latex(first)} \\cdot {d.of(second)}",
            to_latex(derivative),
        ],
        [first_step, second_step],
    )


def quotient_rule(numerator, denominator, function, d):
    numerator_derivative, numerator_step = explain_part(numerator, d)
    denominator_derivative, denominator_step = explain_part(denominator, d)
    derivative = (
        numerator_derivative * denominator - numerator * denominator_derivative
    ) / denominator**2
    formula = (
        rf"\\frac{{{d.of(numerator)} \\cdot {factor_latex(denominator)} - "
        rf"{factor_latex(numerator)} \\cdot {d.of(denominator)}}}"
        rf"{{{power_base_latex(denominator)}^{{2}}}}"
    )
    return derivative, make_step(
        "Quotient rule",
        r"For a quotient $\\frac{u}{v}$, $\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^{2}}$. "
        rf"Here $u = {to_latex(numerator)}$ and $v = {to_latex(denominator)}$.",
        [d.of(function), formula, to_latex(derivative)],
        [numerator_step, denominator_step],
    )


def power_rule(function, d):
    base, exponent = function.as_base_exp()
    if not exponent.has(d.variable):
        return constant_exponent_rule(base, exponent, function, d)
    if not base.has(d.variable):
        return exponential_rule(base, exponent, function, d)
    return logarithmic_differentiation(base, exponent, function, d)


def constant_exponent_rule(base, exponent, function, d):
    rewrite_note = ""
    if not (exponent.is_integer and exponent.is_positive):
        power_form = rf"{power_base_latex(base)}^{{{to_latex(exponent)}}}"
        rewrite_note = f" Write it as a power first: \${to_latex(function)} = {power_form}$."
    if base == d.variable:
        derivative = exponent * base ** (exponent - 1)
        return derivative, make_step(
            "Power rule",
            r"Bring the exponent down and lower it by one: "
            rf"\${d.of(base ** sympy.Symbol('n'))} = n {d.name}^{{n-1}}$.{rewrite_note}",
            [d.of(function), to_latex(derivative)],
        )
    base_derivative, base_step = explain_part(base, d)
    outer_derivative = exponent * base ** (exponent - 1)
    derivative = outer_derivative * base_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is the power $u^{{{to_latex(exponent)}}}$ (use the power rule) "
        rf"and the inner function is $u = {to_latex(base)}$. {CHAIN_RULE_ADVICE}{rewrite_note}",
        [d.of(function), rf"{factor_latex(outer_derivative)} \\cdot {d.of(base)}", to_latex(derivative)],
        [base_step],
    )


def exponential_rule(base, exponent, function, d):
    outer_derivative = function * sympy.log(base)
    if exponent == d.variable:
        return outer_derivative, make_step(
            "Exponential rule",
            rf"\${d.of(sympy.Symbol('a') ** d.variable)} = a^{{{d.name}}} \\ln a$ for a constant base $a$.",
            [d.of(function), to_latex(outer_derivative)],
        )
    exponent_derivative, exponent_step = explain_part(exponent, d)
    derivative = outer_derivative * exponent_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is $a^{{u}}$ with $a = {to_latex(base)}$, whose derivative is "
        rf"$a^{{u}} \\ln a$, and the inner function is $u = {to_latex(exponent)}$. {CHAIN_RULE_ADVICE}",
        [
            d.of(function),
            rf"{factor_latex(outer_derivative)} \\cdot {d.of(exponent)}",
            to_latex(derivative),
        ],
        [exponent_step],
    )


def logarithmic_differentiation(base, exponent, function, d):
    logarithm = exponent * sympy.log(base)
    logarithm_derivative, logarithm_step = explain_derivative(logarithm, d)
    derivative = function * logarithm_derivative
    return derivative, make_step(
        "Logarithmic differentiation",
        rf"Both the base and the exponent contain \${d.name}$, so neither the power rule nor the "
        rf"exponential rule applies. Rewrite \${to_latex(function)} = e^{{{to_latex(logarithm)}}}$ "
        "and use the chain rule.",
        [d.of(function), rf"{factor_latex(function)} \\cdot {d.of(logarithm)}", to_latex(derivative)],
        [logarithm_step],
    )


def function_rule(function, d):
    outer = function.func
    inner = function.args[0]
    outer_derivative_formula = sympy.diff(outer(U), U)
    if inner == d.variable:
        derivative = outer_derivative_formula.subs(U, inner)
        name = FUNCTION_NAMES.get(outer)
        return derivative, make_step(
            f"Derivative of {name}" if name else "Basic derivative",
            "One of the basic derivatives to know by heart.",
            [d.of(function), to_latex(derivative)],
        )
    inner_derivative, inner_step = explain_part(inner, d)
    outer_derivative = outer_derivative_formula.subs(U, inner)
    derivative = outer_derivative * inner_derivative
    return derivative, make_step(
        "Chain rule",
        rf"The outer function is \${to_latex(outer(U))}$, whose derivative is "
        rf"\${to_latex(outer_derivative_formula)}$, and the inner function is "
        rf"$u = {to_latex(inner)}$. {CHAIN_RULE_ADVICE}",
        [d.of(function), rf"{factor_latex(outer_derivative)} \\cdot {d.of(inner)}", to_latex(derivative)],
        [inner_step],
    )
`,"./python/mathlab/expressions.py":`"""Shared symbols, the input error, and printing math as LaTeX."""

import sympy
from sympy.printing.latex import LatexPrinter

X = sympy.Symbol("x", real=True)
Y = sympy.Symbol("y", real=True)


class InputError(Exception):
    """The user's input cannot be used; the message says why and what to do."""


# Functions written the textbook way: sin x, sin(x^2), sin^2 x.
TEXTBOOK_FUNCTIONS = {
    "sin": r"\\sin",
    "cos": r"\\cos",
    "tan": r"\\tan",
    "cot": r"\\cot",
    "sec": r"\\sec",
    "csc": r"\\csc",
    "sinh": r"\\sinh",
    "cosh": r"\\cosh",
    "tanh": r"\\tanh",
    "asin": r"\\arcsin",
    "acos": r"\\arccos",
    "atan": r"\\arctan",
    "sech": r"\\operatorname{sech}",
    "csch": r"\\operatorname{csch}",
    "coth": r"\\coth",
    "asec": r"\\operatorname{arcsec}",
    "acsc": r"\\operatorname{arccsc}",
    "acot": r"\\operatorname{arccot}",
    "asinh": r"\\operatorname{arsinh}",
    "acosh": r"\\operatorname{arcosh}",
    "atanh": r"\\operatorname{artanh}",
    "erf": r"\\operatorname{erf}",
    "sign": r"\\operatorname{sgn}",
}

# LaTeX that is taller than a line of text, which needs tall parentheses.
TALL_LATEX = (r"\\frac", r"\\int", r"\\sum", r"\\sqrt")


class TextbookLatexPrinter(LatexPrinter):
    """Prints functions as textbooks write them.

    SymPy writes sin(x) as \\\\sin{\\\\left(x \\\\right)}, which shows a gap and
    oversized parentheses. This prints sin x, sin(x^2), sin^2 x, and ln|x|.
    """

    def _argument(self, argument):
        text = self._print(argument)
        is_simple = isinstance(argument, sympy.Symbol) or (
            argument.is_Integer and not argument.could_extract_minus_sign()
        )
        if is_simple:
            return f" {text}"
        if any(tall in text for tall in TALL_LATEX):
            return rf"\\left({text}\\right)"
        return f"({text})"

    def _call(self, name, argument, exponent):
        if exponent is not None:
            name = f"{name}^{{{exponent}}}"
        return name + self._argument(argument)

    def _print_Function(self, expr, exp=None):
        name = TEXTBOOK_FUNCTIONS.get(type(expr).__name__)
        if name is None or len(expr.args) != 1:
            return super()._print_Function(expr, exp)
        return self._call(name, expr.args[0], exp)

    def _print_log(self, expr, exp=None):
        argument = expr.args[0]
        if isinstance(argument, sympy.Abs):
            name = r"\\ln" if exp is None else rf"\\ln^{{{exp}}}"
            return name + self._print(argument)
        return self._call(r"\\ln", argument, exp)


LATEX_PRINTER = TextbookLatexPrinter({"inv_trig_style": "full"})


def to_latex(expression):
    return LATEX_PRINTER.doprint(sympy.sympify(expression))


def factor_latex(expression):
    """LaTeX for an expression used as a factor, in parentheses when needed."""
    # SymPy sometimes stores constants as Python ints, which lack SymPy's methods.
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, sympy.Add) or expression.could_extract_minus_sign():
        return rf"\\left({text}\\right)"
    return text


def power_base_latex(expression):
    """LaTeX for an expression that will be raised to a power."""
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, (sympy.Symbol, sympy.Number)) and not expression.could_extract_minus_sign():
        return text
    return rf"\\left({text}\\right)"


def differential_latex(expression, variable):
    """LaTeX for a differential like 2x dx, with parentheses around sums: (x + 1) dx."""
    expression = sympy.sympify(expression)
    text = to_latex(expression)
    if isinstance(expression, sympy.Add):
        text = rf"\\left({text}\\right)"
    return rf"{text}\\,d{to_latex(variable)}"


def with_absolute_value_logs(expression):
    """Write ln(u) as ln|u|, the textbook form that also holds where u < 0."""
    return expression.replace(
        lambda part: isinstance(part, sympy.log) and not isinstance(part.args[0], sympy.Abs),
        lambda part: sympy.log(sympy.Abs(part.args[0])),
    )
`,"./python/mathlab/integral_steps.py":`"""Step-by-step integrals, from the rule tree SymPy's manualintegrate builds.

manualintegrate solves integrals with the techniques taught in calculus
courses (substitution, integration by parts, partial fractions, ...) and
records which rule it used at each step. This module picks the simplest
solution when there are several and turns its rules into explained steps.
"""

import dataclasses
import re

import sympy
from sympy.integrals import manualintegrate

from mathlab.expressions import (
    differential_latex,
    factor_latex,
    power_base_latex,
    to_latex,
    with_absolute_value_logs,
)
from mathlab.steps import make_step

# Solutions with more rules than this are too long to read as steps.
MAX_STEP_COUNT = 60

STANDARD_LABELS = {
    "SinRule": "Integral of sine",
    "CosRule": "Integral of cosine",
    "Sec2Rule": "Integral of sec²",
    "Csc2Rule": "Integral of csc²",
    "SecTanRule": "Integral of sec · tan",
    "CscCotRule": "Integral of csc · cot",
    "SinhRule": "Integral of sinh",
    "CoshRule": "Integral of cosh",
    "ArctanRule": "Arctangent form",
    "ArcsinRule": "Arcsine form",
    "ArcsinhRule": "Inverse sinh form",
}

SPECIAL_FUNCTION_RULES = (
    "ErfRule",
    "FresnelSRule",
    "FresnelCRule",
    "EiRule",
    "SiRule",
    "CiRule",
    "ChiRule",
    "ShiRule",
    "LiRule",
    "UpperGammaRule",
    "PolylogRule",
    "EllipticFRule",
    "EllipticERule",
)


def child_rules(rule):
    for field in dataclasses.fields(rule):
        value = getattr(rule, field.name)
        if isinstance(value, manualintegrate.Rule):
            yield value
        elif isinstance(value, list):
            yield from (item for item in value if isinstance(item, manualintegrate.Rule))


def rule_count(rule):
    return 1 + sum(rule_count(child) for child in child_rules(rule))


def substitution_size(rule):
    """How complicated the substitutions are, to prefer u = x^2 over u = e^(x^2)."""
    own = sympy.count_ops(rule.u_func) if isinstance(rule, manualintegrate.URule) else 0
    return own + sum(substitution_size(child) for child in child_rules(rule))


def choose_alternatives(rule):
    """Replace each AlternativeRule with its simplest alternative, recursively."""
    if isinstance(rule, manualintegrate.AlternativeRule):
        candidates = [choose_alternatives(alternative) for alternative in rule.alternatives]
        return min(
            candidates,
            key=lambda candidate: (
                candidate.contains_dont_know(),
                rule_count(candidate),
                substitution_size(candidate),
            ),
        )
    changes = {}
    for field in dataclasses.fields(rule):
        value = getattr(rule, field.name)
        if isinstance(value, manualintegrate.Rule):
            changes[field.name] = choose_alternatives(value)
        elif isinstance(value, list) and any(isinstance(item, manualintegrate.Rule) for item in value):
            changes[field.name] = [
                choose_alternatives(item) if isinstance(item, manualintegrate.Rule) else item
                for item in value
            ]
    return dataclasses.replace(rule, **changes) if changes else rule


def find_integral_rule(function, variable):
    """Return (rule, antiderivative) solved with textbook rules, or None if there is no such solution."""
    try:
        rule = choose_alternatives(manualintegrate.integral_steps(function, variable))
        if rule.contains_dont_know():
            return None
        return rule, rule.eval()
    except Exception:  # manualintegrate fails in many ways on integrals it cannot do.
        return None


def explain_integral(rule, use_absolute_logs):
    """Return the list of steps explaining rule.

    use_absolute_logs writes ln|u| instead of ln(u), to match the final answer.
    """
    present = with_absolute_value_logs if use_absolute_logs else (lambda expression: expression)
    return [explain_rule(rule, present)]


def integral_of(integrand, variable):
    return to_latex(sympy.Integral(integrand, variable))


def result_latex(rule, present):
    return to_latex(present(rule.eval()))


def explain_rule(rule, present):
    for rule_type in type(rule).__mro__:
        explainer = EXPLAINERS.get(rule_type)
        if explainer is not None:
            return explainer(rule, present)
    return explain_other(rule, present)


def explain_constant(rule, present):
    return make_step(
        "Constant rule",
        rf"The integral of a constant $c$ is $c\\,{to_latex(rule.variable)}$.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_constant_times(rule, present):
    return make_step(
        "Constant multiple rule",
        f"Move the constant \${to_latex(rule.constant)}$ outside the integral.",
        [
            integral_of(rule.integrand, rule.variable),
            rf"{factor_latex(rule.constant)} {integral_of(rule.other, rule.variable)}",
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_power(rule, present):
    note = ""
    if not (rule.exp.is_integer and rule.exp.is_positive):
        power_form = rf"{power_base_latex(rule.base)}^{{{to_latex(rule.exp)}}}"
        note = f" Here \${to_latex(rule.integrand)} = {power_form}$."
    return make_step(
        "Power rule",
        r"Raise the power by one and divide by the new power: "
        rf"$\\int x^{{n}}\\,dx = \\frac{{x^{{n+1}}}}{{n+1}}$ for $n \\neq -1$.{note}",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_reciprocal(rule, _present):
    # ln|u| is the textbook antiderivative of 1/u, whatever the final answer uses.
    return make_step(
        "Reciprocal rule",
        r"$\\int \\frac{1}{u}\\,du = \\ln|u|$, because the derivative of $\\ln|u|$ is $\\frac{1}{u}$.",
        [integral_of(rule.integrand, rule.variable), to_latex(with_absolute_value_logs(rule.eval()))],
    )


def explain_exp(rule, present):
    variable = to_latex(rule.variable)
    if rule.base == sympy.E:
        explanation = rf"$e^{{{variable}}}$ is its own derivative, so it is also its own antiderivative."
    else:
        explanation = r"$\\int a^{x}\\,dx = \\frac{a^{x}}{\\ln a}$ for a constant base $a$."
    return make_step(
        "Exponential rule",
        explanation,
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_add(rule, present):
    terms = [substep.integrand for substep in rule.substeps]
    return make_step(
        "Sum rule",
        "Integrate each term separately, then add the results.",
        [
            integral_of(rule.integrand, rule.variable),
            " + ".join(integral_of(term, rule.variable) for term in terms),
            result_latex(rule, present),
        ],
        [explain_rule(substep, present) for substep in rule.substeps],
    )


def explain_substitution(rule, present):
    variable = rule.variable
    u_latex = to_latex(rule.u_func)
    du = sympy.diff(rule.u_func, variable)
    inner = rule.substep
    return make_step(
        "Substitution",
        rf"Let $u = {u_latex}$, so $du = {differential_latex(du, variable)}$. Rewrite the "
        rf"integral in terms of $u$, integrate, then put $u = {u_latex}$ back.",
        [
            integral_of(rule.integrand, variable),
            integral_of(inner.integrand, rule.u_var),
            to_latex(present(inner.eval())),
            result_latex(rule, present),
        ],
        [explain_rule(inner, present)],
    )


def explain_parts(rule, present, variable=None):
    """Explain one integration by parts.

    Inside cyclic integration by parts, SymPy leaves the rule's variable and
    remaining integral empty, so the parent passes the variable and shows the math.
    """
    variable = rule.variable if rule.variable is not None else variable
    v = rule.v_step.eval()
    du = sympy.diff(rule.u, variable)
    explanation = (
        rf"Use $\\int u\\,dv = uv - \\int v\\,du$ with $u = {to_latex(rule.u)}$ and "
        rf"$dv = {differential_latex(rule.dv, variable)}$. Then "
        rf"$du = {differential_latex(du, variable)}$ and $v = {to_latex(present(v))}$."
    )
    if rule.second_step is None:
        return make_step("Integration by parts", explanation, [])
    return make_step(
        "Integration by parts",
        explanation,
        [
            integral_of(rule.integrand, variable),
            rf"{to_latex(present(rule.u * v))} - {integral_of(rule.second_step.integrand, variable)}",
            result_latex(rule, present),
        ],
        [explain_rule(rule.second_step, present)],
    )


def explain_cyclic_parts(rule, present):
    return make_step(
        "Integration by parts (cyclic)",
        "Integrating by parts twice brings back the original integral. Move it to the "
        "left-hand side and solve for it.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
        [explain_parts(parts_rule, present, rule.variable) for parts_rule in rule.parts_rules],
    )


def explain_rewrite(rule, present):
    variable = rule.variable
    equation = f"{to_latex(rule.integrand)} = {to_latex(rule.rewritten)}"
    is_partial_fractions = (
        rule.integrand.is_rational_function(variable)
        and len(sympy.Add.make_args(sympy.expand(rule.rewritten))) > 1
    )
    if is_partial_fractions:
        label, explanation = "Partial fractions", f"Split the fraction into simpler ones: \${equation}$."
    else:
        label, explanation = "Rewrite", f"Rewrite the integrand: \${equation}$."
    return make_step(
        label,
        explanation,
        [
            integral_of(rule.integrand, variable),
            integral_of(rule.rewritten, variable),
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_trig_substitution(rule, present):
    theta = to_latex(rule.theta)
    return make_step(
        "Trigonometric substitution",
        rf"Let \${to_latex(rule.variable)} = {to_latex(rule.func)}$, which turns the square root "
        rf"into a trigonometric function. Integrate in \${theta}$, then convert back.",
        [
            integral_of(rule.integrand, rule.variable),
            integral_of(rule.rewritten, rule.theta),
            result_latex(rule, present),
        ],
        [explain_rule(rule.substep, present)],
    )


def explain_special_function(rule, present):
    return make_step(
        "Special function",
        "This integral has no antiderivative made of elementary functions (powers, roots, "
        "exponentials, logarithms, and trig functions), so the answer uses a special function "
        "defined by an integral like this one.",
        [integral_of(rule.integrand, rule.variable), result_latex(rule, present)],
    )


def explain_standard(rule, present):
    antiderivative = present(rule.eval())
    return make_step(
        STANDARD_LABELS.get(type(rule).__name__, "Standard integral"),
        rf"Differentiating \${to_latex(antiderivative)}$ gives \${to_latex(rule.integrand)}$, "
        "so it is an antiderivative.",
        [integral_of(rule.integrand, rule.variable), to_latex(antiderivative)],
    )


def explain_other(rule, present):
    name = re.sub(r"(?<!^)(?=[A-Z])", " ", type(rule).__name__).lower().capitalize()
    math = []
    if rule.integrand is not None:
        math = [integral_of(rule.integrand, rule.variable), result_latex(rule, present)]
    return make_step(name, "", math, [explain_rule(child, present) for child in child_rules(rule)])


EXPLAINERS = {
    manualintegrate.ConstantRule: explain_constant,
    manualintegrate.ConstantTimesRule: explain_constant_times,
    manualintegrate.PowerRule: explain_power,
    manualintegrate.ReciprocalRule: explain_reciprocal,
    manualintegrate.ExpRule: explain_exp,
    manualintegrate.AddRule: explain_add,
    manualintegrate.URule: explain_substitution,
    manualintegrate.PartsRule: explain_parts,
    manualintegrate.CyclicPartsRule: explain_cyclic_parts,
    manualintegrate.RewriteRule: explain_rewrite,
    manualintegrate.TrigSubstitutionRule: explain_trig_substitution,
    manualintegrate.AtomicRule: explain_standard,
}
for _rule_name in SPECIAL_FUNCTION_RULES:
    if hasattr(manualintegrate, _rule_name):
        EXPLAINERS[getattr(manualintegrate, _rule_name)] = explain_special_function
`,"./python/mathlab/integral_strategies.py":`"""Extra integration strategies, tried when the textbook rules alone fail.

SymPy's general algorithms can run for many minutes on integrals a student
could do by hand with the right rewrite. This module does those rewrites:

Trig with one angle. In 7 sin^2(2x+3) / cos^3(2x-3), substitute u = 2x - 3
(the angle in the denominator), expand sin(u + 6) with the angle-addition
formula, and write each term with tan and sec. The pieces are then standard
integrals. This finishes in about a second, while SymPy alone did not finish
in five minutes.
"""

import sympy
from sympy.integrals.manualintegrate import manualintegrate

from mathlab.expressions import X, differential_latex, to_latex
from mathlab.steps import make_step

U = sympy.Dummy("u", real=True)


def trig_angles(function):
    return {atom.args[0] for atom in function.atoms(sympy.sin, sympy.cos, sympy.tan, sympy.sec, sympy.csc, sympy.cot)}


def tan_sec_term(term):
    """sin(t)^a / cos(t)^b with b >= a becomes tan(t)^a sec(t)^(b - a);
    any other 1/cos(t)^b becomes sec(t)^b."""
    powers = term.as_powers_dict()
    for factor, exponent in powers.items():
        if isinstance(factor, sympy.cos) and exponent.is_negative:
            angle = factor.args[0]
            sine = sympy.sympify(powers.get(sympy.sin(angle), 0))
            cosine = -exponent
            if sine.is_nonnegative and sine <= cosine:
                rest = term / (sympy.sin(angle) ** sine * sympy.cos(angle) ** exponent)
                return rest * sympy.tan(angle) ** sine * sympy.sec(angle) ** (cosine - sine)
    return term


def with_tan_and_sec(expression):
    return sympy.Add(*(tan_sec_term(term) for term in sympy.Add.make_args(sympy.expand(expression))))


def finish_remaining_integrals(expression):
    """Do any integrals the textbook rules left undone; each is small by now."""
    return expression.replace(
        lambda part: isinstance(part, sympy.Integral),
        lambda part: sympy.integrate(part.function, *part.limits),
    )


def integrate_with_one_angle(function):
    """Return (antiderivative, steps), or None if this strategy doesn't apply.

    Applies when the trig functions' angles are linear in x with the same
    slope, like 2x + 3 and 2x - 3, and some trig function is in a denominator.
    """
    angles = trig_angles(function)
    linear = [angle for angle in angles if angle.is_polynomial(X) and sympy.degree(angle, X) == 1]
    if not angles or len(linear) != len(angles):
        return None
    slopes = {sympy.Poly(angle, X).coeffs()[0] for angle in linear}
    in_denominator = {
        power.base.args[0]
        for power in function.atoms(sympy.Pow)
        if power.exp.is_negative and isinstance(power.base, (sympy.sin, sympy.cos))
    }
    if len(slopes) != 1 or not in_denominator:
        return None
    slope = slopes.pop()
    angle = sorted(in_denominator, key=str)[0]
    x_in_terms_of_u = sympy.solve(sympy.Eq(angle, U), X)[0]
    expanded = sympy.expand(sympy.expand_trig(function.subs(X, x_in_terms_of_u) / slope))
    rewritten = with_tan_and_sec(expanded)
    in_u = finish_remaining_integrals(manualintegrate(rewritten, U))
    if in_u.has(sympy.Integral):
        return None
    antiderivative = in_u.subs(U, angle)
    steps = [
        make_step(
            "Substitution",
            rf"Let $u = {to_latex(angle)}$, the angle in the denominator, so "
            rf"$du = {differential_latex(slope, X)}$. Write every other angle in terms of $u$ "
            r"and expand it with the angle-addition formulas, such as "
            r"$\\sin(a + b) = \\sin a \\cos b + \\cos a \\sin b$.",
            [to_latex(sympy.Integral(function, X)), to_latex(sympy.Integral(expanded, U))],
        ),
        make_step(
            "Rewrite with tan and sec",
            r"Divide through by the cosines: $\\frac{\\sin u}{\\cos u} = \\tan u$ and "
            r"$\\frac{1}{\\cos u} = \\sec u$. Each term becomes a standard integral.",
            [to_latex(sympy.Integral(expanded, U)), to_latex(sympy.Integral(rewritten, U))],
        ),
        make_step(
            "Integrate term by term",
            r"Use the standard integrals of $\\sec u$, $\\sec u \\tan u$, $\\sec^{2} u$, and "
            r"$\\tan^{2} u \\sec u$ (by parts), then substitute "
            rf"$u = {to_latex(angle)}$ back.",
            [to_latex(sympy.Integral(rewritten, U)), to_latex(in_u), to_latex(antiderivative)],
        ),
    ]
    return antiderivative, steps
`,"./python/mathlab/latex_input.py":`"""Translate LaTeX from the math input box (MathLive) into text the parser reads.

The box shows real math, so the translation follows how a textbook reads what
is on screen: sin x cos x is sin(x)·cos(x), sin 2x is sin(2x), sin²x is
(sin x)², sin⁻¹x is arcsin x, and log₂ x is log base 2 of x. Only known
commands are translated; anything else is reported, never passed through.
"""

import re

from mathlab.expressions import InputError

TOKEN = re.compile(r"\\\\[A-Za-z]+|\\\\.|\\d+(?:\\.\\d+)?|\\S")

FUNCTIONS = {
    **{
        name: name
        for name in (
            "sin cos tan sec csc cot sinh cosh tanh coth arcsin arccos arctan ln log exp"
        ).split()
    },
    "arcsec": "arcsec",
    "arccsc": "arccsc",
    "arccot": "arccot",
}

# Functions whose -1 power means the inverse function: sin⁻¹ x is arcsin x.
INVERTIBLE = set("sin cos tan sec csc cot sinh cosh tanh".split())

# Functions spelled with \\operatorname{...}.
OPERATOR_NAMES = {
    "sech",
    "csch",
    "coth",
    "arcsec",
    "arccsc",
    "arccot",
    "arcsinh",
    "arccosh",
    "arctanh",
    "sgn",
    "sign",
    "erf",
    "floor",
    "ceil",
    "abs",
}

GREEK = {
    "alpha",
    "theta",
    "phi",
    "varphi",
    "omega",
    "lambda",
    "mu",
    "sigma",
    "tau",
    "rho",
    "delta",
    "epsilon",
    "varepsilon",
    "psi",
    "xi",
    "eta",
    "kappa",
    "nu",
}
GREEK_SPELLINGS = {"lambda": "lamda", "varphi": "phi", "varepsilon": "epsilon"}

SYMBOLS = {
    r"\\pi": "pi",
    r"\\infty": "oo",
    r"\\cdot": "*",
    r"\\times": "*",
    r"\\ast": "*",
    r"\\div": "/",
    r"\\exponentialE": "e",
    r"\\Gamma": "gamma",
    r"\\lvert": "|",
    r"\\rvert": "|",
    r"\\vert": "|",
    r"\\mid": "|",
}

SPACING = {r"\\,", r"\\;", r"\\:", r"\\!", r"\\ ", r"\\quad", r"\\qquad"}

# Brackets. \\mleft and \\mright are MathLive's spellings of \\left and \\right.
LEFT_COMMANDS = {r"\\left", r"\\mleft"}
RIGHT_COMMANDS = {r"\\right", r"\\mright"}
OPENING_TOKENS = {"(", "[", *LEFT_COMMANDS}
CLOSING_TOKENS = {")", "]", *RIGHT_COMMANDS}
ABSOLUTE_VALUE_BARS = {"|", r"\\vert", r"\\lvert"}

# A function's argument ends at these, so sin x cos x is sin(x)·cos(x).
ARGUMENT_ENDS = {"+", "-", "=", ",", "/", "}", r"\\cdot", r"\\times", r"\\div", *CLOSING_TOKENS}


class LatexReader:
    def __init__(self, latex):
        self.tokens = TOKEN.findall(latex)
        self.position = 0

    def peek(self):
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def take(self):
        token = self.peek()
        if token is None:
            raise InputError("The expression seems to be unfinished.")
        self.position += 1
        return token

    def skip_spacing(self):
        while self.peek() in SPACING:
            self.position += 1

    def read(self, stop=lambda token: False):
        """Read until stop(token) is true or the input ends; return plain text."""
        parts = []
        while True:
            self.skip_spacing()
            token = self.peek()
            if token is None or stop(token):
                return " ".join(parts)
            parts.append(self.atom())

    def group(self):
        """One argument: {...} or a single item, like the 2 in x^2."""
        self.skip_spacing()
        if self.peek() == "{":
            self.take()
            text = self.read(lambda token: token == "}")
            self.take()
            return text
        return self.atom()

    def delimited(self):
        """A bracketed group, as text with its brackets.

        Brackets pair up by counting, not by kind. The math box can store
        7(sin(2x+3))^2 as 7( \\\\sin\\\\left(2x+3) \\\\right)^2 -- the ) typed
        inside sin's brackets closes them, and sin's \\\\right) closes the
        first (. Pairing by kind would misread that; counting matches what
        is on screen.
        """
        token = self.take()
        is_absolute_value = False
        if token in LEFT_COMMANDS:
            bracket = self.take()
            is_absolute_value = bracket in ABSOLUTE_VALUE_BARS
        parts = []
        while True:
            self.skip_spacing()
            next_token = self.peek()
            if next_token is None:
                raise InputError("A bracket is never closed. Add the missing ).")
            if next_token in CLOSING_TOKENS:
                self.take()
                if next_token in RIGHT_COMMANDS:
                    self.take()  # The bracket's shape, such as ) or |.
                inner = " ".join(parts)
                return f"abs({inner})" if is_absolute_value else f"({inner})"
            parts.append(self.atom())

    def function(self, name):
        """A function and its argument, following textbook conventions."""
        self.skip_spacing()
        power = None
        base = None
        if self.peek() == "_" and name == "log":
            self.take()
            base = self.group()
        if self.peek() == "^":
            self.take()
            power = self.group()
        self.skip_spacing()
        if self.peek() in OPENING_TOKENS:
            argument = self.delimited()
        else:
            argument = f"({self.read(lambda token: token in ARGUMENT_ENDS or self.is_function(token))})"
            if argument == "()":
                raise InputError(f"{name} needs something to act on, like {name}(x).")
        if name in INVERTIBLE and power is not None and power.replace(" ", "") in ("-1", "(-1)"):
            # sin⁻¹ x means arcsin x, not 1/sin x.
            name, power = f"arc{name}", None
        call = f"log({argument}, {base})" if base is not None else f"{name}({argument})"
        return f"({call})^({power})" if power is not None else call

    def is_function(self, token):
        if token == r"\\operatorname":
            return True
        return token.startswith("\\\\") and token[1:] in FUNCTIONS

    def atom(self):
        token = self.take()
        if token in OPENING_TOKENS:
            self.position -= 1
            return self.delimited()
        if token in CLOSING_TOKENS or token == "}":
            raise InputError("There's an extra closing bracket.")
        if token == r"\\placeholder":
            raise InputError("Fill in the empty boxes first.")
        if token == "{":
            text = self.read(lambda next_token: next_token == "}")
            self.take()
            return f"({text})"
        if token == "^":
            return f"^({self.group()})"
        if token == "_":
            raise InputError("Subscripts aren't supported here, except in log_b.")
        if token in (r"\\frac", r"\\dfrac", r"\\tfrac"):
            numerator = self.group()
            denominator = self.group()
            return f"(({numerator})/({denominator}))"
        if token == r"\\sqrt":
            if self.peek() == "[":
                self.take()
                index = self.read(lambda next_token: next_token == "]")
                self.take()
                return f"root({self.group()}, {index})"
            return f"sqrt({self.group()})"
        if token == r"\\operatorname":
            name = self.group().replace(" ", "")
            if name not in OPERATOR_NAMES:
                raise InputError(f"I don't know the function {name} yet.")
            return self.function(name)
        if token in (r"\\mathrm", r"\\text", r"\\mathit"):
            text = self.group().replace(" ", "")
            if text in ("e", "d", "x", "y") or text in FUNCTIONS:
                return self.function(text) if text in FUNCTIONS else text
            raise InputError(f'I can\\'t read the text "{text}" here.')
        if token.startswith("\\\\") and token[1:] in FUNCTIONS:
            return self.function(FUNCTIONS[token[1:]])
        if token.startswith("\\\\") and token[1:] in GREEK:
            return GREEK_SPELLINGS.get(token[1:], token[1:])
        if token in SYMBOLS:
            return SYMBOLS[token]
        if token in SPACING:
            return ""
        if token.startswith("\\\\"):
            raise InputError(f"I can't read {token} yet.")
        return token


def latex_to_text(latex):
    """Plain text for the parser, from LaTeX typed in the math input box."""
    reader = LatexReader(latex)
    text = reader.read()
    if reader.peek() is not None:
        raise InputError("Check the brackets: one of them doesn't pair up.")
    return text
`,"./python/mathlab/multivariable.py":`"""Functions of two variables: partial derivatives, the gradient, and surface samples."""

import math

import mpmath
import sympy

from mathlab.checks import check_partial_derivative, check_with_constants, numeric_function, plot_value
from mathlab.derivative_steps import Differentiation, derivative_with_steps
from mathlab.expressions import X, Y, InputError, to_latex

VARIABLES = (X, Y)
MAX_POINT_COORDINATE = 1_000_000

# The surface is drawn on a square centered at the chosen point. Half-widths
# are tried largest first: a steep function like e^(xy) gets a smaller square,
# so huge values far away don't flatten the surface near the point.
SURFACE_HALF_WIDTHS = (3.0, 1.5, 0.75)
SURFACE_POINT_COUNT = 41
# A square is used when its values spread at most this many times as much as
# the values in its middle third.
MAX_SPREAD_RATIO = 20


def is_number(value):
    # JSON true/false arrive as bools, which Python also counts as ints.
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_point(raw):
    """Read the point (a, b) as exact numbers, so 0.5 becomes 1/2."""
    if not (isinstance(raw, list) and len(raw) == 2 and all(is_number(value) for value in raw)):
        raise InputError("Enter the point as two numbers, x and y.")
    if any(abs(value) > MAX_POINT_COORDINATE for value in raw):
        raise InputError(f"Keep the point's coordinates between -{MAX_POINT_COORDINATE:,} and {MAX_POINT_COORDINATE:,}.")
    return tuple(sympy.Rational(str(value)) for value in raw)


def exact_real(expression):
    """Return (exact value, float) for a number like 4 + 2 cos(2), or None if it
    is undefined, infinite, or not real."""
    value = sympy.simplify(expression)
    if value.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        return None
    try:
        number = complex(value.evalf())
    except TypeError:  # Something symbolic remained, so there is no number.
        return None
    if not math.isfinite(number.real) or abs(number.imag) > 1e-12 * max(1, abs(number.real)):
        return None
    return value, number.real


def decimal(number):
    return f"{number:.4g}"


def point_latex(point):
    return rf"\\left({to_latex(point[0])}, {to_latex(point[1])}\\right)"


def partial_derivative(function, variable):
    d = Differentiation(variable, partial=True)
    derivative, steps, steps_note = derivative_with_steps(function, d, VARIABLES)
    return derivative, {
        "variable": d.name,
        "equationLatex": rf"f_{{{d.name}}} = {d.of(function)} = {to_latex(derivative)}",
        "resultText": str(derivative),
        "check": check_with_constants(
            lambda f, result: check_partial_derivative(f, result, variable),
            function,
            derivative,
            VARIABLES,
        ),
        "steps": steps,
        "stepsNote": steps_note,
    }


def gradient_with_constants(partials, substitutions, at):
    """The gradient when f has constants like a: exact, with no decimals."""
    exact = [sympy.simplify(partial.subs(substitutions)) for partial in partials]
    vector = rf"\\left\\langle {to_latex(exact[0])},\\ {to_latex(exact[1])} \\right\\rangle"
    length = sympy.simplify(sympy.sqrt(exact[0] ** 2 + exact[1] ** 2))
    return {
        "ok": True,
        "latex": rf"\\nabla f{at} = {vector}",
        "lengthLatex": rf"\\left\\lVert \\nabla f{at} \\right\\rVert = {to_latex(length)}",
        "vector": None,
    }


def gradient_at(function, partials, point):
    substitutions = dict(zip(VARIABLES, point))
    at = point_latex(point)
    if function.free_symbols - set(VARIABLES):
        return gradient_with_constants(partials, substitutions, at)
    components = [exact_real(partial.subs(substitutions)) for partial in partials]
    if exact_real(function.subs(substitutions)) is None or None in components:
        return {
            "ok": False,
            "detail": f"f or one of its partial derivatives isn't defined at \${at}$, "
            "so the gradient doesn't exist there. Try another point.",
        }
    exact = [value for value, _ in components]
    numbers = [number for _, number in components]
    vector = rf"\\left\\langle {to_latex(exact[0])},\\ {to_latex(exact[1])} \\right\\rangle"
    gradient = rf"\\nabla f{at} = {vector}"
    if not all(value.is_Rational for value in exact):
        gradient += rf" \\approx \\left\\langle {decimal(numbers[0])},\\ {decimal(numbers[1])} \\right\\rangle"
    length = sympy.sqrt(exact[0] ** 2 + exact[1] ** 2)
    length_latex = rf"\\left\\lVert \\nabla f{at} \\right\\rVert = {to_latex(length)}"
    if not length.is_Rational:
        length_latex += rf" \\approx {decimal(math.hypot(*numbers))}"
    return {"ok": True, "latex": gradient, "lengthLatex": length_latex, "vector": numbers}


def spread(values):
    """How far apart the values are, ignoring the top and bottom 2%."""
    finite = sorted(value for value in values if value is not None)
    if len(finite) < 2:
        return 0.0
    last = len(finite) - 1
    return finite[int(0.98 * last)] - finite[int(0.02 * last)]


def sample_square(as_numeric, center, half_width):
    xs, ys = (
        [
            round(float(middle) - half_width + 2 * half_width * index / (SURFACE_POINT_COUNT - 1), 6)
            for index in range(SURFACE_POINT_COUNT)
        ]
        for middle in center
    )
    # Plotly's surface takes rows of z values, one row for each y.
    z = [[plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in xs] for y in ys]
    return xs, ys, z


def sample_surface(function, center):
    as_numeric = numeric_function(function, VARIABLES)
    middle = slice(SURFACE_POINT_COUNT // 3, 2 * SURFACE_POINT_COUNT // 3 + 1)
    for half_width in SURFACE_HALF_WIDTHS:
        xs, ys, z = sample_square(as_numeric, center, half_width)
        all_values = [value for row in z for value in row]
        middle_values = [value for row in z[middle] for value in row[middle]]
        if spread(all_values) <= MAX_SPREAD_RATIO * max(spread(middle_values), 1e-9):
            break
    value_at_point = exact_real(function.subs(dict(zip(VARIABLES, center))))
    return {
        "x": xs,
        "y": ys,
        "z": z,
        "point": [float(center[0]), float(center[1]), value_at_point[1] if value_at_point else None],
    }


def partial_derivatives(function, point):
    results = [partial_derivative(function, variable) for variable in VARIABLES]
    partials = [derivative for derivative, _ in results]
    constants = sorted(function.free_symbols - set(VARIABLES), key=str)
    return {
        "ok": True,
        "operation": "partial",
        "functionLatex": rf"f(x, y) = {to_latex(function)}",
        "constants": [to_latex(constant) for constant in constants],
        "partials": [details for _, details in results],
        "gradient": gradient_at(function, partials, point),
        # With constants like a there is no single surface to draw.
        "surface": None if constants else sample_surface(function, point),
    }
`,"./python/mathlab/parsing.py":`"""Reading the student's input: translate textbook notation, then parse safely.

Students write math many ways: x², √x, |x|, π, 2·x, log_2(x), sin⁻¹... All of
it is translated to plain text first. Only then is the text checked against a
short list of safe characters, because SymPy's parse_expr runs its input as
Python. Letters other than the variables are constants, like a, b, c in
a x^2 + b x + c.
"""

import math
import re
import string

import sympy
from sympy.parsing.sympy_parser import (
    _token_splittable,
    convert_xor,
    function_exponentiation,
    implicit_application,
    implicit_multiplication,
    parse_expr,
    split_symbols_custom,
    standard_transformations,
)

from mathlab.expressions import X, InputError

MAX_INPUT_LENGTH = 200
# Exact numbers with more digits than this are refused; SymPy would take
# minutes or hours to build them.
MAX_EXACT_DIGITS = 100_000

# After translation, only these characters may remain. Without quotes,
# brackets, underscores, or = signs, input cannot reach anything in Python
# except SymPy's math functions.
ALLOWED_CHARACTERS = re.compile(r"[A-Za-z0-9\\s+\\-*/^().,!]*")

GREEK_LETTERS = {
    "α": "alpha",
    "θ": "theta",
    "φ": "phi",
    "ϕ": "phi",
    "ω": "omega",
    "λ": "lamda",  # SymPy's spelling, since lambda is a Python keyword.
    "μ": "mu",
    "σ": "sigma",
    "τ": "tau",
    "ρ": "rho",
    "δ": "delta",
    "ε": "epsilon",
    "ψ": "psi",
    "ξ": "xi",
    "η": "eta",
    "κ": "kappa",
    "ν": "nu",
}

# Symbols to plain text. Spaces keep names apart: 2π becomes 2 pi.
SYMBOL_TRANSLATIONS = {
    "π": " pi ",
    "∞": " oo ",
    "√": " sqrt ",
    "∛": " cbrt ",
    "Γ": " gamma ",
    "·": "*",
    "⋅": "*",
    "×": "*",
    "∗": "*",
    "÷": "/",
    "∕": "/",
    "−": "-",
    "–": "-",
    "—": "-",
    "[": "(",
    "]": ")",
    "{": "(",
    "}": ")",
    **{letter: f" {name} " for letter, name in GREEK_LETTERS.items()},
}

SUPERSCRIPTS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺", "0123456789-+")
SUPERSCRIPT_RUN = re.compile("[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+")


def log_base(base):
    return lambda argument: sympy.log(argument, base)


# Names students use that SymPy spells differently. Everything else, such as
# sec, sinh, sqrt, cbrt, exp, floor, erf, and gamma, comes from SymPy itself.
FUNCTION_ALIASES = {
    "ln": sympy.log,
    "log10": log_base(10),
    "log2": log_base(2),
    "arcsin": sympy.asin,
    "arccos": sympy.acos,
    "arctan": sympy.atan,
    "arcsec": sympy.asec,
    "arccsc": sympy.acsc,
    "arccot": sympy.acot,
    "arcsinh": sympy.asinh,
    "arccosh": sympy.acosh,
    "arctanh": sympy.atanh,
    "abs": sympy.Abs,
    "sgn": sympy.sign,
    "ceil": sympy.ceiling,
}

# Every function name a student might type, for spotting typos like sinx.
FUNCTION_NAMES = sorted(
    {
        *FUNCTION_ALIASES,
        *"sin cos tan sec csc cot sinh cosh tanh sech csch coth".split(),
        *"asin acos atan asec acsc acot asinh acosh atanh log exp sqrt cbrt".split(),
        *"floor ceiling sign erf gamma factorial".split(),
    },
    key=len,
    reverse=True,
)

# Letters stand for constants (every letter except e, which is Euler's number).
CONSTANT_NAMES = [letter for letter in string.ascii_letters if letter not in "eE"] + sorted(
    set(GREEK_LETTERS.values())
)

NAMES = {
    "e": sympy.E,
    "E": sympy.E,
    "pi": sympy.pi,
    **FUNCTION_ALIASES,
    **{name: sympy.Symbol(name, real=True) for name in CONSTANT_NAMES},
}


def splittable(name):
    """Whether to split a run of letters like xy into x*y. Runs that start with a
    function name, like sinx, are kept whole so they can be reported as typos."""
    if any(name.startswith(function) for function in FUNCTION_NAMES):
        return False
    return _token_splittable(name)


TRANSFORMATIONS = standard_transformations + (
    split_symbols_custom(splittable),
    implicit_multiplication,
    implicit_application,
    function_exponentiation,
    convert_xor,
)

# Textbook notation like sin^2(x), which means (sin(x))^2.
FUNCTION_POWER = re.compile(r"\\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log)\\^(\\d+)\\s*\\(")
# log_2(x) or log_b(x): a logarithm with a base.
LOG_WITH_BASE = re.compile(r"\\blog_([0-9]+|[A-Za-z])\\s*\\(")


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


def rewrite_log_bases(text):
    """Rewrite log_2(x) as log(x, 2)."""
    while match := LOG_WITH_BASE.search(text):
        open_index = match.end() - 1
        close_index = find_closing_parenthesis(text, open_index)
        if close_index is None:
            break
        argument = text[open_index + 1 : close_index]
        text = f"{text[: match.start()]}log({argument}, {match.group(1)}){text[close_index + 1 :]}"
    return text


def rewrite_absolute_bars(text):
    """Rewrite |x| as abs(x). A bar opens a new absolute value at the start, after
    an operator or another bar; otherwise it closes the innermost one."""
    result = []
    depth = 0
    for index, character in enumerate(text):
        if character != "|":
            result.append(character)
            continue
        previous = text[:index].rstrip()[-1:]
        if depth == 0 or previous in ("", "(", "+", "-", "*", "/", "^", ",", "|"):
            result.append("abs(")
            depth += 1
        else:
            result.append(")")
            depth -= 1
    if depth != 0:
        raise InputError("The absolute value bars | | don't pair up.")
    return "".join(result)


# √ or ∛ directly before one number or letter applies to just that, as in
# √x · sin(x). Before a parenthesis it applies to the whole parenthesis.
ROOT_OF_ONE_SYMBOL = re.compile(r"([√∛])\\s*(\\d+(?:\\.\\d+)?|[A-Za-zπα-ω])")


def translate_notation(text):
    """Turn textbook notation into text the parser reads."""
    text = ROOT_OF_ONE_SYMBOL.sub(lambda match: f"{match.group(1)}({match.group(2)})", text)
    for symbol, replacement in SYMBOL_TRANSLATIONS.items():
        text = text.replace(symbol, replacement)
    text = SUPERSCRIPT_RUN.sub(lambda run: f"^({run.group().translate(SUPERSCRIPTS)})", text)
    text = rewrite_absolute_bars(text)
    text = rewrite_log_bases(text)
    return rewrite_function_powers(text)


def has_enormous_number(expression):
    """True if computing expression exactly would build a gigantic number, like
    9^9^9^9, which would freeze SymPy. expression must be unevaluated."""
    if any(has_enormous_number(argument) for argument in expression.args):
        return True
    if not isinstance(expression, sympy.Pow) or expression.free_symbols:
        return False
    base, exponent = expression.args
    try:
        # Inner powers were checked above, so these are safe to approximate.
        base_size = abs(float(base.evalf(15)))
        exponent_size = abs(float(exponent.evalf(15)))
    except (TypeError, ValueError):  # Not a real number, such as a complex power.
        return False
    if base_size in (0.0, 1.0):
        return False
    digits = exponent_size * abs(math.log10(base_size))
    return digits > MAX_EXACT_DIGITS


def typo_suggestion(name):
    """For a run of letters like sinx, suggest sin(x)."""
    for function in FUNCTION_NAMES:
        if name.startswith(function) and len(name) > len(function):
            return f" Did you mean {function}({name[len(function):]})?"
    return " Use one letter per constant, or put * between letters."


def parse_function(text, variables=(X,)):
    """Parse the student's function. Letters other than the variables are constants."""
    two_variables = len(variables) == 2
    example = "x^2 y + sin(x y)" if two_variables else "x^2 sin(x)"
    text = text.strip()
    if not text:
        description = "x and y" if two_variables else "x"
        raise InputError(f"Type a function of {description}, such as {example}.")
    if len(text) > MAX_INPUT_LENGTH:
        raise InputError(f"That expression is too long (the limit is {MAX_INPUT_LENGTH} characters).")
    text = translate_notation(text)
    unknown_characters = sorted({character for character in text if not ALLOWED_CHARACTERS.fullmatch(character)})
    if unknown_characters:
        raise InputError(f"These characters can't be used here: {' '.join(unknown_characters)}")
    local_names = {**NAMES, **{variable.name: variable for variable in variables}}
    try:
        # Read it first without computing anything, to catch enormous numbers.
        unevaluated = parse_expr(text, local_dict=local_names, transformations=TRANSFORMATIONS, evaluate=False)
        if has_enormous_number(unevaluated):
            raise InputError("That contains a number too large to compute exactly, such as 9^9^9.")
        function = parse_expr(text, local_dict=local_names, transformations=TRANSFORMATIONS)
    except InputError:
        raise
    except Exception as error:  # The parser raises many error types for bad syntax.
        raise InputError("Couldn't read that expression. Check the parentheses and operators.") from error
    if not isinstance(function, sympy.Expr):
        raise InputError(f"That isn't a function. Try something like {example}.")
    for symbol in function.free_symbols:
        if symbol.name not in local_names:
            raise InputError(f"I don't know \\"{symbol.name}\\".{typo_suggestion(symbol.name)}")
    if function.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        raise InputError("That expression is undefined, for example because it divides by zero.")
    return function


def constants_in(function, variables):
    """The letters in function other than its variables, sorted by name."""
    return sorted(function.free_symbols - set(variables), key=lambda symbol: symbol.name)
`,"./python/mathlab/progress.py":`"""Progress messages for long calculations, shown on the page while it waits.

run_request() sets a listener for the duration of a request; any module can
call report() to say what it is trying, such as "Trying the textbook rules…".
"""

_listener = None


def listen(listener):
    """Send reports to listener (a function taking a message), or stop with None."""
    global _listener
    _listener = listener


def report(message):
    if _listener is not None:
        _listener(message)
`,"./python/mathlab/steps.py":`"""The step format shared by derivative and integral explanations.

A step is a dict with the rule's name, a short explanation (text with inline
LaTeX between $ signs), the math it produces (LaTeX), and the steps it builds on.
"""


def equation_latex(parts):
    """Join parts with = signs. Chains of several = signs go one per line,
    aligned on the = signs, as in a written derivation."""
    if len(parts) <= 2:
        return " = ".join(parts)
    first, second, *rest = parts
    lines = [f"{first} &= {second}", *(f"&= {part}" for part in rest)]
    return r"\\begin{aligned}" + r" \\\\ ".join(lines) + r"\\end{aligned}"


def make_step(rule, explanation, math_parts, substeps=()):
    return {
        "rule": rule,
        "explanation": explanation,
        "math": equation_latex(math_parts),
        "substeps": [substep for substep in substeps if substep is not None],
    }
`}),t=`/home/pyodide/python`;function n(n){for(let[r,i]of Object.entries(e)){let e=`${t}/${r.replace(`./python/`,``)}`;n.FS.mkdirTree(e.slice(0,e.lastIndexOf(`/`))),n.FS.writeFile(e,i)}return n.pyimport(`sys`).path.insert(0,t),n.pyimport(`mathlab.calculus`).run_request}const r=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`;function i(e){self.postMessage(e)}async function a(){i({type:`progress`,message:`Downloading Python…`});let{loadPyodide:e}=await import(
/* @vite-ignore */
`${r}pyodide.mjs`),t=await e({indexURL:r});return i({type:`progress`,message:`Loading SymPy…`}),await t.loadPackage(`sympy`),n(t)}const o=a();o.then(()=>i({type:`ready`}),e=>i({type:`loadFailed`,error:String(e)})),self.onmessage=async e=>{let{id:t,...n}=e.data,r;try{let e=await o,a=e=>i({type:`solveProgress`,id:t,message:e});r=JSON.parse(e(JSON.stringify({...n,format:`latex`}),a))}catch(e){r={ok:!1,error:`The math engine failed: ${String(e)}`}}i({type:`response`,id:t,response:r})};