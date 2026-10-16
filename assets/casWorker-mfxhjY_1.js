const e=/* #__PURE__ */ Object.assign({"./python/mathlab/__init__.py":`"""Math Lab's Python side: SymPy-based calculus with checks and explanations."""
`,"./python/mathlab/antiderivatives.py":`"""Finding an antiderivative, with steps when the textbook rules can explain it.

Shared by indefinite, definite, and double integrals. The variable of
integration is x unless given; any other letters are treated as constants.
"""

import sympy

from mathlab.checks import (
    check_antiderivative,
    check_with_constants,
    test_values,
    undefined_where_function_is_defined,
)
from mathlab.expressions import X, InputError, with_absolute_value_logs
from mathlab.integral_steps import MAX_STEP_COUNT, explain_integral, find_integral_rule, rule_count
from mathlab.integral_strategies import integrate_with_one_angle
from mathlab.parsing import constants_in
from mathlab.progress import report


def checked(function, antiderivative, variable):
    """Check an antiderivative, with test values for any constants."""
    return check_with_constants(
        lambda f, F: check_antiderivative(f, F, variable), function, antiderivative, (variable,)
    )


def with_absolute_values_if_needed(function, antiderivative, variable=X):
    """Use ln|u| instead of ln(u) where ln(u) is undefined but the function is not.

    Returns the antiderivative to show and whether absolute values were added.
    """
    if not antiderivative.has(sympy.log):
        return antiderivative, False
    values = test_values(constants_in(function, (variable,)))
    if not undefined_where_function_is_defined(
        function.subs(values), antiderivative.subs(values), variable
    ):
        return antiderivative, False
    candidate = with_absolute_value_logs(antiderivative)
    if checked(function, candidate, variable)["status"] == "verified":
        return candidate, True
    return antiderivative, False


def find_antiderivative(function, variable=X, general=True):
    """Return (antiderivative, check, steps, steps_note).

    Strategies go from the most explainable to the most powerful, reporting
    each one, since hard integrals can take minutes. With general=False, the
    slow general algorithms are skipped, for callers that have a numerical
    answer to fall back on.
    """
    report("Trying the textbook rules (substitution, parts, partial fractions)…")
    found = find_integral_rule(function, variable)
    if found is not None:
        rule, antiderivative = found
        antiderivative, absolute_logs = with_absolute_values_if_needed(
            function, antiderivative, variable
        )
        check = checked(function, antiderivative, variable)
        if check["status"] != "failed":
            if rule_count(rule) > MAX_STEP_COUNT:
                return antiderivative, check, [], "This solution has too many steps to show."
            try:
                steps, steps_note = explain_integral(rule, absolute_logs), None
            except Exception:  # Steps are extra: a failure in them must not block the answer.
                steps, steps_note = [], "Steps couldn't be shown for this integral."
            return antiderivative, check, steps, steps_note
    # This rewrite is written for x, the Solver's usual variable.
    if variable == X:
        report("Rewriting the trig functions in terms of one angle…")
        rewritten = integrate_with_one_angle(function)
        if rewritten is not None:
            antiderivative, steps = rewritten
            antiderivative, _ = with_absolute_values_if_needed(function, antiderivative)
            check = checked(function, antiderivative, variable)
            if check["status"] != "failed":
                return antiderivative, check, steps, None
    if not general:
        raise InputError("No antiderivative was found with the textbook rules.")
    report("Trying SymPy's general algorithms (Risch, Meijer G). Hard integrals can take minutes…")
    antiderivative = sympy.integrate(function, variable)
    if antiderivative.has(sympy.Integral):
        raise InputError(
            "SymPy couldn't find an antiderivative for this function. "
            "Some functions have none that can be written with standard functions."
        )
    antiderivative, _ = with_absolute_values_if_needed(function, antiderivative, variable)
    return (
        antiderivative,
        checked(function, antiderivative, variable),
        [],
        "Steps aren't available: SymPy found this antiderivative with an advanced algorithm "
        "rather than the rules taught in calculus courses.",
    )
`,"./python/mathlab/calculus.py":`"""Calculus operations for the solver, run inside Pyodide (Python in the browser).

The TypeScript side calls run_request() with a JSON string and gets a JSON
string back. SymPy does the math, every answer is checked independently
before it is shown, and answers come with step-by-step explanations when the
rules taught in calculus courses can produce them.
"""

import json

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import check_derivative, check_with_constants, numeric_function, plot_value
from mathlab.curves import analyze_curve, trace
from mathlab.definite import definite_integral
from mathlab.derivative_steps import derivative_with_steps
from mathlab.double import double_integral
from mathlab.expressions import X, Y, Z, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.multivariable import parse_point, partial_derivatives, slices
from mathlab.parsing import constants_in, parse_function
from mathlab.practice import check, practice
from mathlab.practice import solution as practice_solution
from mathlab.progress import listen
from mathlab.riemann import riemann_sum
from mathlab.solid import solid_picture
from mathlab.space_curves import analyze_space_curve, space_trace
from mathlab.triple import triple_integral
from mathlab.vectors import analyze_vectors, parse_vector

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


def integral_solution(function, antiderivative, check, steps, steps_note):
    equation = f"{to_latex(sympy.Integral(function, X))} = {to_latex(antiderivative)} + C"
    return solution("integrate", function, equation, antiderivative, check, steps, steps_note)


def integrate(function):
    return integral_solution(function, *find_antiderivative(function))


def expression_text(request):
    """The request's expression as plain text. The math input box sends LaTeX."""
    expression = request.get("expression", "")
    return latex_to_text(expression) if request.get("format") == "latex" else expression


def preview(request):
    """How the input reads as math, shown while the student types."""
    variables = {("x", "y"): (X, Y), ("x", "y", "z"): (X, Y, Z)}.get(
        tuple(request.get("variables") or ()), (X,)
    )
    function = parse_function(expression_text(request), variables)
    return {
        "ok": True,
        "operation": "preview",
        "latex": to_latex(function),
        "constants": [to_latex(constant) for constant in constants_in(function, variables)],
    }


def solid_bounds(request):
    """A triple integral's bounds as (lower, upper) LaTeX pairs, innermost first:
    the innermost may use the two other variables, the middle the outermost one."""
    return (
        (request.get("innerLower"), request.get("innerUpper")),
        (request.get("middleLower"), request.get("middleUpper")),
        (request.get("lower"), request.get("upper")),
    )


OPERATIONS = {
    "preview": preview,
    "differentiate": lambda request: differentiate(parse_function(expression_text(request))),
    "integrate": lambda request: integrate(parse_function(expression_text(request))),
    # The bounds come from math boxes too, as LaTeX.
    "definite": lambda request: definite_integral(
        parse_function(expression_text(request)), request.get("lower"), request.get("upper")
    ),
    # Inside bounds may depend on the outside variable; all bounds are LaTeX.
    "double": lambda request: double_integral(
        parse_function(expression_text(request), (X, Y)),
        request.get("order"),
        (request.get("innerLower"), request.get("innerUpper")),
        (request.get("lower"), request.get("upper")),
    ),
    "triple": lambda request: triple_integral(
        parse_function(expression_text(request), (X, Y, Z)),
        request.get("order"),
        solid_bounds(request),
    ),
    # The triple-integrals lesson picture: the same bounds, with f = 1.
    "solid": lambda request: solid_picture(request.get("order"), solid_bounds(request)),
    "partial": lambda request: partial_derivatives(
        parse_function(expression_text(request), (X, Y)), parse_point(request.get("point"))
    ),
    # Vector components are short plain-text numbers, like -1/2 or sqrt(3).
    "vectors": lambda request: analyze_vectors(
        parse_vector(request.get("a"), "a"), parse_vector(request.get("b"), "b")
    ),
    "slices": lambda request: slices(
        parse_function(expression_text(request), (X, Y)), parse_point(request.get("point"))
    ),
    # The rectangle's bounds are LaTeX, like the other bounds.
    "riemann": lambda request: riemann_sum(
        parse_function(expression_text(request), (X, Y)),
        request.get("rectangle"),
        request.get("divisions"),
        request.get("sample"),
    ),
    "curve": analyze_curve,
    # The parametric and polar curves lesson picture.
    "trace": trace,
    "space": analyze_space_curve,
    # The space curves lesson picture.
    "spaceTrace": space_trace,
    "practice": practice,
    "check": check,
    "solution": practice_solution,
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


def check_antiderivative(function, antiderivative, variable=X):
    derivative = sympy.diff(antiderivative, variable)
    difference = derivative - function
    if sympy.count_ops(difference) <= MAX_SIMPLIFY_SIZE and sympy.simplify(difference) == 0:
        return {
            "status": "verified",
            "detail": "Differentiating the answer gives back your function exactly.",
        }
    variables = (variable,)
    agreed, disagreed = compare_at_check_points(
        numeric_function(function, variables), numeric_function(derivative, variables), variables
    )
    return numeric_check(
        agreed,
        disagreed,
        "Differentiating the answer matches your function at {count} test points.",
        "Differentiating the answer doesn't give back your function. Don't trust this answer.",
    )


def undefined_where_function_is_defined(function, antiderivative, variable=X):
    as_numeric = numeric_function(function, (variable,))
    antiderivative_numeric = numeric_function(antiderivative, (variable,))
    with mpmath.workdps(CHECK_PRECISION_DIGITS):
        return any(
            real_value(lambda: as_numeric(mpmath.mpf(point))) is not None
            and real_value(lambda: antiderivative_numeric(mpmath.mpf(point))) is None
            for point in CHECK_POINTS
        )
`,"./python/mathlab/curves.py":`"""Parametric and polar curves: the slope, arc length, and area.

A parametric curve is x = x(t), y = y(t) for a ≤ t ≤ b. A polar curve
r = r(θ) is the parametric curve x = r cos θ, y = r sin θ with θ as the
parameter, so both use the same slope and length formulas. Their areas
differ: ∫ y dx under a parametric curve, ½∫ r² dθ inside a polar one.

Arc length integrands, √((dx/dt)² + (dy/dt)²), rarely have antiderivatives,
so only the textbook rules are tried (the general algorithms can run for
minutes); textbook examples are built so that the square root simplifies,
often with a half-angle identity. When no exact length is found, it is
computed numerically and labeled that way.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function
from mathlab.definite import evaluate_between, parse_bound
from mathlab.double import antiderivative_step
from mathlab.expressions import THETA, T, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number
from mathlab.steps import make_step

CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
GRAPH_POINTS = 401
# An exact arc length is tried only for integrands with at most this many
# operations. Textbook ones are short once simplified (measured: 4 for a
# cycloid arch's 2|sin(t/2)|, 9 for the cardioid's, at most 9 in all); the
# speed of ⟨1 + t³, te⁻ᵗ, sin 2t⟩ has 15, and the textbook rules spent six
# seconds on it before failing.
EXACT_LENGTH_LIMIT = 12


def parse_curve_function(text, name, parameter):
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter {name}.")
    try:
        function = parse_function(latex_to_text(text), (parameter,))
    except InputError as error:
        raise InputError(f"{name}: {error}") from error
    constants = constants_in(function, (parameter,))
    if constants:
        raise InputError(
            f"{name} must use only {to_text(parameter)}, so the answers are numbers. "
            f"Remove {', '.join(str(constant) for constant in constants)}."
        )
    return function


def to_text(parameter):
    return "θ" if parameter == THETA else "t"


def parse_interval(lower_text, upper_text, parameter):
    low, high = (
        parse_bound(text, f"{name} {to_text(parameter)}")
        for text, name in ((lower_text, "starting"), (upper_text, "ending"))
    )
    if low.is_infinite or high.is_infinite:
        raise InputError("The interval must be finite, so the curve has a beginning and an end.")
    if not (high - low).is_positive:
        raise InputError(f"The starting {to_text(parameter)} must be less than the ending one.")
    return low, high


def latex_value(value):
    """value in LaTeX, with a decimal after it when it isn't a whole number or fraction."""
    text = to_latex(value)
    if not value.is_Rational:
        number = sympy.N(value, 15)
        if number.is_real:
            text += rf" \\approx {mpmath.nstr(mpmath.mpf(str(number)), 6)}"
    return text


# ---------------------------------------------------------------- the slope


def slope_steps(curve):
    """dy/dx and d²y/dx², and the slope at the chosen point if there is one."""
    p, dxdt, dydt = curve["parameter"], curve["dxdt"], curve["dydt"]
    name = to_latex(p)
    slope = sympy.simplify(dydt / dxdt)
    if curve["kind"] == "polar":
        r, drdtheta = curve["r"], sympy.diff(curve["r"], p)
        slope_step = make_step(
            "Slope of a polar curve",
            r"A polar curve is the parametric curve $x = r\\cos\\theta$, $y = r\\sin\\theta$, with "
            r"$\\theta$ as the parameter. Differentiate both with the product rule, then divide.",
            [
                r"\\frac{dy}{dx} = \\frac{dy/d\\theta}{dx/d\\theta} = "
                r"\\frac{\\frac{dr}{d\\theta}\\sin\\theta + r\\cos\\theta}"
                r"{\\frac{dr}{d\\theta}\\cos\\theta - r\\sin\\theta}",
                rf"\\frac{{\\left({to_latex(drdtheta)}\\right)\\sin\\theta + \\left({to_latex(r)}\\right)\\cos\\theta}}"
                rf"{{\\left({to_latex(drdtheta)}\\right)\\cos\\theta - \\left({to_latex(r)}\\right)\\sin\\theta}}",
                to_latex(slope),
            ],
        )
    else:
        slope_step = make_step(
            "Slope of a parametric curve",
            rf"By the chain rule, $\\frac{{dy}}{{d{name}}} = \\frac{{dy}}{{dx}} \\cdot \\frac{{dx}}{{d{name}}}$, "
            rf"so wherever $\\frac{{dx}}{{d{name}}} \\ne 0$, divide.",
            [
                rf"\\frac{{dy}}{{dx}} = \\frac{{dy/d{name}}}{{dx/d{name}}}",
                rf"\\frac{{{to_latex(dydt)}}}{{{to_latex(dxdt)}}}",
                to_latex(slope),
            ],
        )
    second = sympy.simplify(sympy.diff(slope, p) / dxdt)
    second_step = make_step(
        "Second derivative of a parametric curve",
        rf"$\\frac{{d^2y}}{{dx^2}}$ is the derivative of $\\frac{{dy}}{{dx}}$ with respect to $x$, "
        rf"so differentiate the slope with respect to \${name}$ and divide by "
        rf"$\\frac{{dx}}{{d{name}}}$ again.",
        [
            rf"\\frac{{d^2y}}{{dx^2}} = \\frac{{\\frac{{d}}{{d{name}}}\\left(\\frac{{dy}}{{dx}}\\right)}}{{dx/d{name}}}",
            to_latex(second),
        ],
    )
    results = [
        {"label": "Slope", "latex": rf"\\frac{{dy}}{{dx}} = {to_latex(slope)}"},
        {"label": "Second derivative", "latex": rf"\\frac{{d^2y}}{{dx^2}} = {to_latex(second)}"},
    ]
    steps = [slope_step, second_step]
    if curve["at"] is not None:
        step, result = tangent_at(curve, curve["at"])
        steps.append(step)
        results.append(result)
    return steps, results


def tangent_at(curve, at):
    p = curve["parameter"]
    name = to_latex(p)
    x0, y0 = (sympy.simplify(coordinate.subs(p, at)) for coordinate in (curve["x"], curve["y"]))
    dx0, dy0 = (sympy.simplify(derivative.subs(p, at)) for derivative in (curve["dxdt"], curve["dydt"]))
    curve["point"] = (x0, y0, dx0, dy0)
    point = rf"\\left({to_latex(x0)}, {to_latex(y0)}\\right)"
    at_text = rf"{name} = {to_latex(at)}"
    if dx0 == 0 and dy0 == 0:
        explanation = rf"Both $\\frac{{dx}}{{d{name}}}$ and $\\frac{{dy}}{{d{name}}}$ are $0$ here, so the formula gives $\\frac{{0}}{{0}}$ and doesn't decide the slope."
        latex = r"\\frac{dy}{dx} \\text{ is undefined } \\left(\\tfrac{0}{0}\\right)"
    elif dx0 == 0:
        explanation = rf"$\\frac{{dx}}{{d{name}}} = 0$ but $\\frac{{dy}}{{d{name}}} \\ne 0$: the curve moves straight up or down here, so the tangent is vertical."
        latex = r"\\text{vertical tangent}"
    else:
        value = sympy.simplify(dy0 / dx0)
        explanation = (
            rf"Substitute \${to_latex(at)}$ for \${name}$ in $\\frac{{dy}}{{dx}}$. The curve is at "
            rf"\${point}$ there."
        )
        latex = rf"\\frac{{dy}}{{dx}} = {latex_value(value)}"
        if value == 0:
            explanation += " The slope is $0$, so the tangent is horizontal."
    step = make_step(
        "Slope at a point",
        explanation,
        [rf"\\left.\\frac{{dy}}{{dx}}\\right|_{{{at_text}}} = \\frac{{{to_latex(dy0)}}}{{{to_latex(dx0)}}}", latex]
        if dx0 != 0
        else [latex],
    )
    return step, {"label": "Slope at the point", "latex": rf"{at_text}: \\quad {latex}"}


# ------------------------------------------------------------ the arc length


def half_angle_form(speed_squared, parameter):
    """(c, g, identity) with √(speed²) = c |g|, from a half-angle identity, or None.

    1 − cos u = 2 sin²(u/2), 1 + cos u = 2 cos²(u/2), and
    1 ± sin u = (sin(u/2) ± cos(u/2))², each times a positive constant A.
    """
    a = sympy.Wild("a", exclude=[parameter])
    b = sympy.Wild("b", exclude=[parameter])
    u = sympy.Wild("u")
    for trig in (sympy.cos, sympy.sin):
        match = sympy.expand(speed_squared).match(a + b * trig(u))
        if not match or match[b] == 0 or not match[u].has(parameter) or not match[a].is_positive:
            continue
        amount, coefficient, angle = match[a], match[b], match[u]
        half = angle / 2
        if trig is sympy.cos and coefficient == -amount:
            return sympy.sqrt(2 * amount), sympy.sin(half), rf"1 - \\cos u = 2\\sin^2\\frac{{u}}{{2}}"
        if trig is sympy.cos and coefficient == amount:
            return sympy.sqrt(2 * amount), sympy.cos(half), rf"1 + \\cos u = 2\\cos^2\\frac{{u}}{{2}}"
        if trig is sympy.sin and coefficient == amount:
            return (
                sympy.sqrt(amount),
                sympy.sin(half) + sympy.cos(half),
                r"1 + \\sin u = \\left(\\sin\\frac{u}{2} + \\cos\\frac{u}{2}\\right)^2",
            )
        if trig is sympy.sin and coefficient == -amount:
            return (
                sympy.sqrt(amount),
                sympy.sin(half) - sympy.cos(half),
                r"1 - \\sin u = \\left(\\sin\\frac{u}{2} - \\cos\\frac{u}{2}\\right)^2",
            )
    return None


def sign_change_points(integrand, parameter, low, high):
    """Where the inside of each |·| in integrand is 0 strictly between low and high."""
    points = set()
    for absolute in integrand.atoms(sympy.Abs):
        zeros = sympy.solveset(absolute.args[0], parameter, sympy.Interval.open(low, high))
        if zeros is sympy.S.EmptySet:
            continue  # No sign change inside the interval.
        if not isinstance(zeros, sympy.FiniteSet):
            return None
        points.update(zeros)
    return sorted(points, key=lambda point: float(sympy.N(point)))


def without_absolute_values(integrand, parameter, low, high):
    """integrand on (low, high), where no |·| inside changes sign, without the |·|."""
    middle = (low + high) / 2
    replacements = {}
    for absolute in integrand.atoms(sympy.Abs):
        inside = absolute.args[0]
        sign = 1 if float(sympy.N(inside.subs(parameter, middle))) >= 0 else -1
        replacements[absolute] = sign * inside
    return integrand.xreplace(replacements)


def integrate_piece(integrand, parameter, low, high, general=False):
    """∫ integrand from low to high: the step and the value. Without general,
    only the textbook rules are tried, and InputError means they found no
    antiderivative."""
    antiderivative, _, steps, _ = find_antiderivative(integrand, parameter, general=general)
    math, value = evaluate_between(integrand, antiderivative, low, high, parameter)
    step = make_step(
        "Fundamental Theorem of Calculus",
        r"Find an antiderivative and subtract its values at the ends of the interval.",
        math,
        [antiderivative_step(integrand, parameter, antiderivative, steps)],
    )
    return step, value


def arc_length(curve):
    """The arc length: its step, its result for display, its check, and its exact
    value (None when it was only computed numerically)."""
    p, (low, high) = curve["parameter"], curve["interval"]
    name = to_latex(p)
    if curve["kind"] == "polar":
        r = curve["r"]
        speed_squared = sympy.simplify(r**2 + sympy.diff(r, p) ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{r^2 + \\left(\\frac{{dr}}{{d\\theta}}\\right)^2}}\\, d\\theta"
        )
        explanation = (
            r"For a polar curve, $\\left(\\frac{dx}{d\\theta}\\right)^2 + \\left(\\frac{dy}{d\\theta}\\right)^2 "
            r"= r^2 + \\left(\\frac{dr}{d\\theta}\\right)^2$, so the length is the integral of its square "
            r"root."
        )
    elif curve["kind"] == "space":
        speed_squared = sympy.simplify(curve["dxdt"] ** 2 + curve["dydt"] ** 2 + curve["dzdt"] ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} |\\mathbf{{r}}'({name})|\\, d{name} = "
            rf"\\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{x'^2 + y'^2 + z'^2}}\\, d{name}"
        )
        explanation = (
            rf"Over a short time $d{name}$ the point moves $\\sqrt{{dx^2 + dy^2 + dz^2}}$ (the "
            rf"Pythagorean theorem in space), so the length is the integral of the speed "
            rf"$|\\mathbf{{r}}'({name})|$."
        )
    else:
        speed_squared = sympy.simplify(curve["dxdt"] ** 2 + curve["dydt"] ** 2)
        formula = (
            rf"L = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} \\sqrt{{\\left(\\frac{{dx}}{{d{name}}}\\right)^2 + \\left(\\frac{{dy}}{{d{name}}}\\right)^2}}\\, d{name}"
        )
        explanation = (
            rf"Over a short time $d{name}$ the point moves $\\sqrt{{dx^2 + dy^2}}$ (the Pythagorean "
            rf"theorem), so the length is the integral of its speed, $\\sqrt{{\\left(\\frac{{dx}}{{d{name}}}\\right)^2 + \\left(\\frac{{dy}}{{d{name}}}\\right)^2}}$."
        )
    substeps = []
    integrand = sympy.sqrt(speed_squared)
    form = half_angle_form(speed_squared, p)
    if form is not None:
        constant, inside, identity = form
        integrand = constant * sympy.Abs(inside)
        substeps.append(
            make_step(
                "Half-angle identity",
                rf"Use \${identity}$ to write the expression under the root as a perfect square. "
                r"The root of a square is an absolute value: $\\sqrt{g^2} = |g|$.",
                [rf"\\sqrt{{{to_latex(speed_squared)}}}", to_latex(integrand)],
            )
        )
    else:
        # Textbook curves are often built so that the speed squared is a
        # perfect square, like e^(2t) + e^(-2t) + 2 = (e^t + e^(-t))², which
        # factoring reveals. SymPy's simplify writes that one as
        # 2 cosh(2t) + 2, so it is also factored in exponentials.
        factored = min(
            (
                sympy.sqrt(sympy.factor(form))
                for form in (speed_squared, speed_squared.rewrite(sympy.exp))
            ),
            key=sympy.count_ops,
        )
        if sympy.count_ops(factored) < sympy.count_ops(integrand):
            integrand = factored
            substeps.append(
                make_step(
                    "Perfect square",
                    r"The expression under the root factors into a perfect square (times a square), "
                    r"so the root simplifies: $\\sqrt{g^2} = |g|$, which is just $g$ where $g > 0$.",
                    [rf"\\sqrt{{{to_latex(speed_squared)}}}", to_latex(integrand)],
                )
            )
    math = [formula, to_latex(sympy.Integral(integrand, (p, low, high)))]
    points = sign_change_points(integrand, p, low, high)
    ends = [low, *(points or []), high]
    value = None
    # Long integrands are left to numerical integration: the textbook rules can
    # spend many seconds on them and practically never succeed.
    if points is not None and sympy.count_ops(integrand) <= EXACT_LENGTH_LIMIT:
        piece_steps = []
        if points:
            piece_steps.append(
                make_step(
                    "Split where the sign changes",
                    r"$|g| = g$ where $g \\ge 0$ and $|g| = -g$ where $g < 0$, so split the interval "
                    rf"where the expression inside $|\\cdot|$ is $0$: at \${', '.join(to_latex(point) for point in points)}$.",
                    [],
                )
            )
        try:
            pieces = []
            for piece_low, piece_high in zip(ends, ends[1:]):
                piece = without_absolute_values(integrand, p, piece_low, piece_high)
                step, piece_value = integrate_piece(piece, p, piece_low, piece_high)
                piece_steps.append(step)
                pieces.append(piece_value)
            value = sympy.simplify(sum(pieces))
            math.append(latex_value(value))
            substeps.extend(piece_steps)
        except InputError:
            value = None
    as_numeric = numeric_function(sympy.sqrt(speed_squared), (p,))
    # Integrated piece by piece too: across a kink, where |g| turns at 0,
    # numerical integration loses accuracy.
    numeric = numerical_integral(as_numeric, ends)
    if value is None:
        if numeric is None:
            raise InputError("The arc length couldn't be computed, even numerically.")
        shown = mpmath.nstr(numeric, 10)
        math.append(rf"\\approx {shown}")
        note = (
            "No antiderivative was found with the textbook rules (most arc length integrals "
            "have none), so the length was computed numerically."
        )
        substeps.append(make_step("Numerical integration", note, []))
        check = {
            "status": "unchecked",
            "detail": "This length was computed numerically, so there is no exact answer to check it against.",
        }
        result = rf"L \\approx {shown}"
    else:
        check = compare("integration", numeric, value)
        result = rf"L = {latex_value(value)}"
    step = make_step("Arc length", explanation, math, substeps)
    return step, {"label": "Arc length", "latex": result}, check, value


# ------------------------------------------------------------------ the area


def area(curve):
    """The area: its step, its result for display, its check, and its exact value."""
    p, (low, high) = curve["parameter"], curve["interval"]
    name = to_latex(p)
    if curve["kind"] == "polar":
        integrand = sympy.simplify(curve["r"] ** 2 / 2)
        rule = "Area of a polar region"
        explanation = (
            r"The region swept by the radius from $\\theta = a$ to $\\theta = b$ is made of thin "
            r"sectors, each of area $\\frac{1}{2} r^2 \\, d\\theta$ (a circle's sector of angle "
            r"$d\\theta$), so $A = \\frac{1}{2}\\int_a^b r^2 \\, d\\theta$."
        )
        formula = rf"A = \\frac{{1}}{{2}}\\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} r^2 \\, d\\theta"
        label = "Area swept by the radius"
    else:
        integrand = sympy.simplify(curve["y"] * curve["dxdt"])
        rule = "Area under a parametric curve"
        explanation = (
            rf"The area between a curve and the $x$-axis is $\\int y\\, dx$. With $dx = \\frac{{dx}}{{d{name}}}\\, d{name}$ "
            rf"it becomes an integral in \${name}$. It is a signed area: it counts as negative "
            r"where the curve runs right to left or below the axis."
        )
        formula = rf"A = \\int y \\, dx = \\int_{{{to_latex(low)}}}^{{{to_latex(high)}}} y \\, \\frac{{dx}}{{d{name}}} \\, d{name}"
        label = "Area under the curve"
    # Area integrands are polynomials and powers of trig functions, which the
    # general algorithms handle quickly.
    step, value = integrate_piece(integrand, p, low, high, general=True)
    value = sympy.simplify(value)
    as_numeric = numeric_function(integrand, (p,))
    check = compare("integration", numerical_integral(as_numeric, [low, high]), value)
    step = make_step(
        rule,
        explanation,
        [formula, to_latex(sympy.Integral(integrand, (p, low, high))), latex_value(value)],
        [step],
    )
    return step, {"label": label, "latex": rf"A = {latex_value(value)}"}, check, value


# ------------------------------------------------------------------ checking


def numerical_integral(as_numeric, points):
    """The integral of as_numeric over [points[0], points[-1]], one piece between
    each pair of neighboring points."""
    with mpmath.workdps(CHECK_DIGITS):
        try:
            value = mpmath.quad(
                lambda point: real_number(as_numeric(point)),
                [mpmath.mpf(str(sympy.N(point, CHECK_DIGITS))) for point in points],
            )
        except Exception:  # Numerical integration fails in many ways; all mean "no value".
            return None
    return None if isinstance(value, mpmath.mpc) else value


def compare(kind, numeric, exact):
    if numeric is None:
        return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
    with mpmath.workdps(CHECK_DIGITS):
        expected = mpmath.mpmathify(sympy.N(exact, CHECK_DIGITS))
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if isinstance(expected, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        if abs(numeric - expected) <= CHECK_TOLERANCE * max(1, abs(expected)):
            return {
                "status": "verified",
                "detail": f"A numerical {kind} gives \${shown}$, matching the exact answer.",
            }
    return {
        "status": "failed",
        "detail": f"A numerical {kind} gives \${shown}$, which doesn't match. Treat this answer with caution.",
    }


# ------------------------------------------------------------------ the graph


def graph_samples(curve):
    p, (low, high) = curve["parameter"], curve["interval"]
    x_at, y_at = (numeric_function(coordinate, (p,)) for coordinate in (curve["x"], curve["y"]))
    a, b = float(sympy.N(low)), float(sympy.N(high))
    parameters = [a + (b - a) * index / (GRAPH_POINTS - 1) for index in range(GRAPH_POINTS)]

    def value(function, point):
        try:
            number = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
        except Exception:  # Undefined points raise many error types; all mean "no point here".
            return None
        if isinstance(number, mpmath.mpc) or not mpmath.isfinite(number):
            return None
        return round(float(number), 6)

    xs = [value(x_at, point) for point in parameters]
    ys = [value(y_at, point) for point in parameters]
    graph = {"x": xs, "y": ys, "point": None, "tangent": None, "kind": curve["kind"]}
    if curve.get("point"):
        x0, y0, dx0, dy0 = (float(sympy.N(part)) for part in curve["point"])
        graph["point"] = [x0, y0]
        speed = (dx0**2 + dy0**2) ** 0.5
        if speed > 0:
            # A tangent segment as long as a fifth of the curve's width or height.
            spread = max(
                (max(v for v in values if v is not None) - min(v for v in values if v is not None))
                for values in (xs, ys)
            )
            reach = 0.2 * spread / speed
            graph["tangent"] = {
                "x": [x0 - reach * dx0, x0 + reach * dx0],
                "y": [y0 - reach * dy0, y0 + reach * dy0],
            }
    return graph


# ------------------------------------------------- the lesson picture: a trace

TRACE_STEPS = 120


def trace(request):
    """A point moving along the curve: for each of TRACE_STEPS + 1 parameter
    values, the point, its velocity (dx/dt, dy/dt), and the length traced and
    area swept so far, computed numerically piece by piece."""
    curve = curve_from_request(request)
    p, (low, high) = curve["parameter"], curve["interval"]
    functions = {
        name: numeric_function(curve[name], (p,)) for name in ("x", "y", "dxdt", "dydt")
    }
    speed = numeric_function(sympy.sqrt(curve["dxdt"] ** 2 + curve["dydt"] ** 2), (p,))
    if curve["kind"] == "polar":
        sweep = numeric_function(curve["r"] ** 2 / 2, (p,))
    else:
        sweep = numeric_function(curve["y"] * curve["dxdt"], (p,))
    a, b = float(sympy.N(low)), float(sympy.N(high))
    parameters = [a + (b - a) * index / TRACE_STEPS for index in range(TRACE_STEPS + 1)]

    def number(function, point):
        try:
            value = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
        except Exception:  # Undefined points raise many error types; all mean "no value".
            return None
        if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
            return None
        return round(float(value), 6)

    length = area_so_far = 0.0
    samples = []
    for index, point in enumerate(parameters):
        if index > 0:
            piece = [parameters[index - 1], point]
            length += float(numerical_integral(speed, piece) or 0)
            area_so_far += float(numerical_integral(sweep, piece) or 0)
        samples.append(
            {
                "parameter": round(point, 6),
                **{name: number(function, point) for name, function in functions.items()},
                "length": round(length, 6),
                "area": round(area_so_far, 6),
            }
        )
    return {
        "ok": True,
        "operation": "trace",
        "kind": curve["kind"],
        "samples": samples,
        "curve": graph_samples(curve),
    }


# ---------------------------------------------------------------- the request


def build_curve(kind, x, y, r, interval, at=None):
    """Everything the steps need about a curve. For a polar curve, x and y are
    r cos θ and r sin θ; the parameter is θ for a polar curve and t otherwise."""
    parameter = THETA if kind == "polar" else T
    return {
        "kind": kind,
        "parameter": parameter,
        "x": x,
        "y": y,
        "r": r,
        "dxdt": sympy.diff(x, parameter),
        "dydt": sympy.diff(y, parameter),
        "interval": interval,
        "at": at,
        "point": None,
    }


def curve_from_request(request):
    """The curve a request describes: its kind, its function(s) as LaTeX, its
    interval, and an optional parameter value for a tangent."""
    kind = request.get("curveKind")
    if kind not in ("parametric", "polar"):
        raise InputError("Choose a parametric curve or a polar curve.")
    parameter = THETA if kind == "polar" else T
    if kind == "polar":
        r = parse_curve_function(request.get("expression"), "r(θ)", parameter)
        x, y = r * sympy.cos(parameter), r * sympy.sin(parameter)
    else:
        r = None
        x = parse_curve_function(request.get("xExpression"), "x(t)", parameter)
        y = parse_curve_function(request.get("yExpression"), "y(t)", parameter)
    low, high = parse_interval(request.get("lower"), request.get("upper"), parameter)
    at_text = request.get("at")
    at = None
    if isinstance(at_text, str) and at_text.strip():
        at = parse_bound(at_text, f"tangent's {to_text(parameter)}")
        if at.is_infinite:
            raise InputError(f"The tangent's {to_text(parameter)} must be a number.")
    return build_curve(kind, x, y, r, (low, high), at)


def analyze_curve(request):
    curve = curve_from_request(request)
    parameter, (low, high) = curve["parameter"], curve["interval"]
    if curve["kind"] == "polar":
        curve_latex = rf"r = {to_latex(curve['r'])}"
    else:
        curve_latex = rf"x = {to_latex(curve['x'])}, \\quad y = {to_latex(curve['y'])}"
    name = to_latex(parameter)
    report("Finding the slope…")
    steps, results = slope_steps(curve)
    report("Finding the arc length…")
    length_step, length_result, length_check, _ = arc_length(curve)
    report("Finding the area…")
    area_step, area_result, area_check, _ = area(curve)
    return {
        "ok": True,
        "operation": "curve",
        "curveLatex": rf"{curve_latex}, \\quad {to_latex(low)} \\le {name} \\le {to_latex(high)}",
        "results": [*results, length_result, area_result],
        "checks": [
            {"label": "Arc length", "check": length_check},
            {"label": "Area", "check": area_check},
        ],
        "steps": [*steps, length_step, area_step],
        "graph": graph_samples(curve),
    }
`,"./python/mathlab/definite.py":`"""Definite integrals, proper and improper.

A proper integral is F(b) − F(a) by the Fundamental Theorem of Calculus. An
improper one (an infinite bound, or a point where f breaks down) is split so
each piece has one problem end, and that end becomes a limit; the integral
converges only if every limit is finite. Answers are checked independently:
convergent values against a high-precision numerical integration, divergence
against SymPy's own definite integration.
"""

import re

import mpmath
import sympy
from sympy import AccumBounds
from sympy.calculus.util import continuous_domain

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function, plot_value, real_value
from mathlab.expressions import X, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.steps import make_step

CHECK_DIGITS = 30
# The exact answer and the numerical integration must agree this closely.
CHECK_TOLERANCE = mpmath.mpf("1e-10")
GRAPH_POINT_COUNT = 401
# How far the graph reaches toward an infinite bound.
GRAPH_REACH = 10
# The moving bound in a limit.
T = sympy.Symbol("t", real=True)
SIGNED_INFINITY = re.compile(r"^\\s*([+-]?)\\s*(\\\\infty|∞|oo|inf|infinity)\\s*$", re.IGNORECASE)
INFINITY = re.compile(r"\\\\infty|∞|\\b(oo|inf|infinity)\\b", re.IGNORECASE)


def parse_bound(text, name):
    """A bound typed in the math box: an exact real number, ∞, or −∞."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound.")
    infinite = SIGNED_INFINITY.match(text)
    if infinite:
        return -sympy.oo if infinite.group(1) == "-" else sympy.oo
    if INFINITY.search(text):
        raise InputError(f"The {name} bound: use ∞ or −∞ on its own, or a number.")
    try:
        bound = parse_function(latex_to_text(text), ())
    except InputError as error:
        raise InputError(f"The {name} bound: {error}") from error
    if bound.free_symbols or bound.is_real is not True or bound.is_finite is not True:
        raise InputError(
            f"The {name} bound must be a number (like 0, 1/2, π, or π/2), ∞, or −∞."
        )
    return bound


def bound_text(bound):
    """A bound for plain text, like 1, π/2, ∞, or −∞."""
    if bound == sympy.oo:
        return "∞"
    if bound == -sympy.oo:
        return "−∞"
    return str(bound).replace("pi", "π").replace("-", "−")


def problem_points(function, low, high):
    """The finite points of [low, high] where f isn't continuous, in order."""
    report("Looking for points where the function breaks down…")
    interval = sympy.Interval(low, high)
    try:
        gaps = sympy.Complement(interval, continuous_domain(function, X, interval))
    except Exception:  # SymPy can't always tell; the independent check still guards the answer.
        return []
    if gaps == sympy.S.EmptySet:
        return []
    if not isinstance(gaps, sympy.FiniteSet):
        raise InputError(
            f"The function isn't defined, as a real number, on part of the interval from "
            f"{bound_text(low)} to {bound_text(high)}, so this integral has no value."
        )
    return sorted(gaps, key=float)


def regular_point_between(start, end):
    """A point strictly inside (start, end), for splitting a piece in two."""
    if start == -sympy.oo and end == sympy.oo:
        return sympy.Integer(0)
    if start == -sympy.oo:
        return end - 1
    if end == sympy.oo:
        return start + 1
    return (start + end) / 2


def split_into_pieces(low, high, points):
    """Pieces of [low, high], each with at most one problem end."""
    cuts = [low, *[point for point in points if low < point < high], high]

    def is_problem(end):
        return end.is_infinite or end in points

    pieces = []
    for start, end in zip(cuts, cuts[1:]):
        if is_problem(start) and is_problem(end):
            middle = regular_point_between(start, end)
            pieces += [(start, middle), (middle, end)]
        else:
            pieces.append((start, end))
    return pieces


def endpoint_value(antiderivative, point, direction, variable=X):
    """F at a regular end, approaching from inside the piece if F isn't defined right there."""
    value = antiderivative.subs(variable, point)
    if value.has(sympy.nan, sympy.zoo) or value.is_finite is False:
        value = sympy.limit(antiderivative, variable, point, direction)
    return value


def subtracted_latex(value):
    """A value after a minus sign, in parentheses when it is a sum or negative."""
    latex = to_latex(value)
    if isinstance(value, sympy.Add) or value.could_extract_minus_sign():
        return rf"\\left({latex}\\right)"
    return latex


def limit_of(antiderivative, point, direction):
    """The one-sided limit of F at a problem end, or why it doesn't exist.

    Returns (value, reason): reason is None for a finite limit; otherwise it
    says why the piece diverges, and value is ±∞, or None if the limit
    doesn't exist.
    """
    if point.is_infinite:
        value = sympy.limit(antiderivative, X, point)
    else:
        value = sympy.limit(antiderivative, X, point, direction)
    if isinstance(value, sympy.Limit) or value.has(sympy.Limit):
        raise InputError("SymPy couldn't work out a limit this integral needs.")
    if isinstance(value, AccumBounds) or value.has(sympy.nan, sympy.zoo):
        return None, "$F(t)$ keeps oscillating and has no limit"
    if value.is_infinite:
        return value, rf"$F(t) \\to {to_latex(value)}$"
    return value, None


def limit_latex(point, direction):
    target = to_latex(point) if point.is_infinite else f"{to_latex(point)}^{{{direction}}}"
    return rf"\\lim_{{t \\to {target}}}"


def improper_piece(function, antiderivative, start, end, points):
    """One piece with a problem end: the step, and its value (None if it diverges)."""
    upper_is_problem = end.is_infinite or end in points
    moving, fixed = (end, start) if upper_is_problem else (start, end)
    direction = "-" if upper_is_problem else "+"
    side = "upper" if upper_is_problem else "lower"
    lim = limit_latex(moving, direction)
    target = lim.removeprefix(r"\\lim_{").removesuffix("}")
    if moving.is_infinite:
        reason = (
            rf"The {side} bound is \${to_latex(moving)}$, so replace it with $t$ and let "
            rf"\${target}$."
        )
    else:
        reason = (
            rf"$f$ breaks down at $x = {to_latex(moving)}$, the {side} end of this piece, so "
            rf"replace that end with $t$ and let \${target}$."
        )
    fixed_value = endpoint_value(antiderivative, fixed, "+" if upper_is_problem else "-")
    limit_value, divergence = limit_of(antiderivative, moving, direction)

    at_t = to_latex(antiderivative.subs(X, T))
    if upper_is_problem:
        inner = sympy.Integral(function, (X, start, T))
        bracket = rf"\\left[{to_latex(antiderivative)}\\right]_{{{to_latex(start)}}}^{{t}}"
        difference = rf"\\left({at_t} - {subtracted_latex(fixed_value)}\\right)"
    else:
        inner = sympy.Integral(function, (X, T, end))
        bracket = rf"\\left[{to_latex(antiderivative)}\\right]_{{t}}^{{{to_latex(end)}}}"
        at_t_subtracted = subtracted_latex(antiderivative.subs(X, T))
        difference = rf"\\left({to_latex(fixed_value)} - {at_t_subtracted}\\right)"
    math = [
        to_latex(sympy.Integral(function, (X, start, end))),
        f"{lim} {to_latex(inner)}",
        f"{lim} {bracket}",
        f"{lim} {difference}",
    ]
    if limit_value is None:
        piece_value = None
        math.append(r"\\text{does not exist}")
    elif upper_is_problem:
        piece_value = sympy.simplify(limit_value - fixed_value)
    else:
        piece_value = sympy.simplify(fixed_value - limit_value)
    if piece_value is not None:
        math.append(to_latex(piece_value))
    if divergence is None:
        verdict = "The limit is finite, so this piece converges."
    else:
        verdict = rf"As \${target}$, {divergence}, so this piece diverges."
    step = make_step("Improper integral", f"{reason} {verdict}", math)
    # A diverging piece has no value to add.
    return step, (piece_value if divergence is None else None)


def evaluate_between(function, antiderivative, low, high, variable=X):
    """F(high) − F(low), written out: the equation's parts and the value.

    The bounds may contain other variables, as an inner integral's do.
    """
    at_high = endpoint_value(antiderivative, high, "-", variable)
    at_low = endpoint_value(antiderivative, low, "+", variable)
    value = sympy.simplify(at_high - at_low)
    difference = f"{to_latex(at_high)} - {subtracted_latex(at_low)}"
    math = [
        to_latex(sympy.Integral(function, (variable, low, high))),
        rf"\\left[{to_latex(antiderivative)}\\right]_{{{to_latex(low)}}}^{{{to_latex(high)}}}",
        difference,
    ]
    if to_latex(value) != difference:
        math.append(to_latex(value))
    return math, value


def proper_step(function, antiderivative, low, high):
    """F(high) − F(low), for an interval where f is continuous: the step and the value."""
    math, value = evaluate_between(function, antiderivative, low, high)
    step = make_step(
        "Fundamental Theorem of Calculus",
        r"Evaluate the antiderivative at the upper bound and subtract its value at the lower "
        r"bound: $\\int_a^b f(x)\\,dx = F(b) - F(a)$.",
        math,
    )
    return step, value


def mpmath_point(point):
    if point == sympy.oo:
        return mpmath.inf
    if point == -sympy.oo:
        return -mpmath.inf
    return mpmath.mpf(str(sympy.N(point, CHECK_DIGITS)))


def sympy_definite(function, low, high):
    """SymPy's own definite integration, as an independent opinion, or None."""
    try:
        result = sympy.integrate(function, (X, low, high))
    except Exception:  # Its algorithms fail in many ways; all mean "no opinion".
        return None
    return None if result.has(sympy.Integral) else result


def check_convergent(function, cuts, value, low, high):
    with mpmath.workdps(CHECK_DIGITS):
        exact = real_value(lambda: sympy.N(value, CHECK_DIGITS))
        try:
            numeric = mpmath.quad(numeric_function(function), [mpmath_point(cut) for cut in cuts])
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if exact is not None and numeric is not None and not isinstance(numeric, mpmath.mpc):
            shown = mpmath.nstr(numeric, 10).removesuffix(".0")
            if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
                return {
                    "status": "verified",
                    "detail": f"A high-precision numerical integration gives \${shown}$, "
                    "matching the exact answer.",
                }
            if low.is_finite and high.is_finite:
                return {
                    "status": "failed",
                    "detail": f"A numerical integration gives \${shown}$, which doesn't match. "
                    "Treat this answer with caution.",
                }
    # Numerical integration over an infinite interval can struggle (slow, oscillating
    # integrands), so ask SymPy's own definite integration instead.
    other = sympy_definite(function, low, high)
    if other is not None and other.is_finite and sympy.simplify(other - value) == 0:
        return {
            "status": "verified",
            "detail": "SymPy's own definite integration, a different method, gives the same value.",
        }
    return {"status": "unchecked", "detail": "The value couldn't be confirmed by a second method."}


def check_divergent(function, low, high):
    other = sympy_definite(function, low, high)
    if other is not None and (other.is_infinite or other.has(sympy.nan, sympy.zoo, AccumBounds)):
        return {
            "status": "verified",
            "detail": "SymPy's own definite integration, a different method, also finds no "
            "finite value.",
        }
    if other is not None and other.is_finite:
        return {
            "status": "failed",
            "detail": f"SymPy's own definite integration gives \${to_latex(other)}$, which "
            "disagrees. Treat this answer with caution.",
        }
    return {
        "status": "unchecked",
        "detail": "A divergent integral has no value to check numerically; the limits in the "
        "steps show why it diverges.",
    }


def graph_samples(function, low, high):
    """f around the interval, with the part of it that fits on the graph for shading."""
    if low.is_finite and high.is_finite:
        margin = max(0.25 * float(high - low), 0.5)
        start, end = float(low) - margin, float(high) + margin
    elif low.is_finite:
        start, end = float(low) - 0.5, float(low) + GRAPH_REACH
    elif high.is_finite:
        start, end = float(high) - GRAPH_REACH, float(high) + 0.5
    else:
        start, end = -GRAPH_REACH, GRAPH_REACH
    shade_from = float(low) if low.is_finite else start
    shade_to = float(high) if high.is_finite else end
    step = (end - start) / (GRAPH_POINT_COUNT - 1)
    points = [start + step * index for index in range(GRAPH_POINT_COUNT)]
    # Include the shading's ends, so it starts and stops exactly there.
    xs = sorted({round(point, 6) for point in [*points, shade_from, shade_to]})
    as_numeric = numeric_function(function)
    values = [plot_value(lambda point=point: as_numeric(mpmath.mpf(point))) for point in xs]
    return {"x": xs, "input": values, "area": [round(shade_from, 6), round(shade_to, 6)]}


def graph_note(low, high, converges):
    note = (
        f"Shaded: the region between f(x) and the x-axis from {bound_text(low)} to "
        f"{bound_text(high)}"
    )
    if low.is_infinite or high.is_infinite:
        note += ", which goes on past the edge of the graph"
    note += ". The integral adds the area above the axis and subtracts the area below it."
    if not converges:
        note += " Here that total has no finite value, so the integral diverges."
    return note


def definite_integral(function, lower_text, upper_text):
    lower = parse_bound(lower_text, "lower")
    upper = parse_bound(upper_text, "upper")
    constants = constants_in(function, (X,))
    if constants:
        names = ", ".join(str(constant) for constant in constants)
        raise InputError(
            f"A definite integral needs a function of x alone, so its answer is a number. "
            f"Remove {names}, or use Integrate for an antiderivative with constants."
        )
    reversed_bounds = (upper - lower).is_negative is True
    low, high = (upper, lower) if reversed_bounds else (lower, upper)
    integral = to_latex(sympy.Integral(function, (X, lower, upper)))
    if low == high:
        return result(integral, function, low, high, [], sympy.Integer(0), [low, high], False)

    points = problem_points(function, low, high)
    antiderivative, _, antiderivative_steps, _ = find_antiderivative(function)
    steps = []
    if reversed_bounds:
        steps.append(
            make_step(
                "Swap the bounds",
                r"Integrating from the larger bound to the smaller one gives the negative: "
                r"$\\int_a^b f(x)\\,dx = -\\int_b^a f(x)\\,dx$.",
                [integral, f"-{to_latex(sympy.Integral(function, (X, low, high)))}"],
            )
        )
    steps.append(
        make_step(
            "Find an antiderivative",
            r"Any antiderivative works, because the constant $C$ cancels in the subtraction, "
            r"so take $C = 0$.",
            [to_latex(sympy.Integral(function, X)), f"{to_latex(antiderivative)} + C"],
            antiderivative_steps,
        )
    )

    report("Evaluating the antiderivative at the bounds…")
    pieces = split_into_pieces(low, high, points)
    cuts = [low, *[end for _, end in pieces]]
    if len(pieces) == 1 and not (low.is_infinite or high.is_infinite or points):
        step, value = proper_step(function, antiderivative, low, high)
        steps.append(step)
        return result(integral, function, low, high, steps, value, cuts, reversed_bounds)

    if len(pieces) > 1:
        where = ", ".join(f"$x = {to_latex(point)}$" for point in cuts[1:-1])
        steps.append(
            make_step(
                "Split the integral",
                f"The integral is improper at more than one place, so split it at {where}. "
                "It converges only if every piece converges.",
                [
                    to_latex(sympy.Integral(function, (X, low, high))),
                    " + ".join(to_latex(sympy.Integral(function, (X, a, b))) for a, b in pieces),
                ],
            )
        )
    values = []
    for start, end in pieces:
        if (end.is_infinite or end in points) or (start.is_infinite or start in points):
            step, value = improper_piece(function, antiderivative, start, end, points)
        else:
            step, value = proper_step(function, antiderivative, start, end)
        steps.append(step)
        values.append(value)
    total = None if any(value is None for value in values) else sympy.simplify(sum(values))
    return result(integral, function, low, high, steps, total, cuts, reversed_bounds)


def result(integral, function, low, high, steps, value, cuts, reversed_bounds):
    """The response: value is None when the integral diverges."""
    converges = value is not None
    if converges:
        shown = -value if reversed_bounds else value
        equation = f"{integral} = {to_latex(shown)}"
        if not shown.is_Rational:
            equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(shown, 15))), 6)}"
        check = check_convergent(function, cuts, value, low, high)
    else:
        equation = rf"{integral} \\text{{ diverges}}"
        check = check_divergent(function, low, high)
    return {
        "ok": True,
        "operation": "definite",
        "equationLatex": equation,
        "converges": converges,
        "check": check,
        "steps": steps,
        "stepsNote": None,
        "graph": graph_samples(function, low, high),
        "graphNote": graph_note(low, high, converges),
    }
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
`,"./python/mathlab/double.py":`"""Double integrals, as iterated integrals (Fubini's theorem).

The inside integral is taken first, with the outside variable held constant;
its bounds may depend on the outside variable, which describes a region that
isn't a rectangle. The value is checked with a numerical double integration.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function, plot_value, real_value
from mathlab.definite import INFINITY, evaluate_between, parse_bound
from mathlab.expressions import X, Y, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number, simplify_on_region
from mathlab.steps import make_step

# The order of integration: (inside variable, outside variable).
ORDERS = {"dy dx": (Y, X), "dx dy": (X, Y)}
CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
GRID_SIZE = 41
OUTLINE_POINTS = 60


def parse_inside_bound(text, name, inside, outside):
    """An inside bound: a number or an expression in the outside variable."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound of the inside integral.")
    if INFINITY.search(text):
        raise InputError("Infinite bounds in a double integral aren't supported yet.")
    try:
        bound = parse_function(latex_to_text(text), (outside,))
    except InputError as error:
        raise InputError(f"The inside integral's {name} bound: {error}") from error
    names = {str(symbol) for symbol in bound.free_symbols}
    if str(inside) in names:
        raise InputError(
            f"The inside integral's bounds can depend on {outside} but not on {inside}, "
            f"the variable it integrates."
        )
    if names - {str(outside)}:
        raise InputError(
            f"The inside integral's {name} bound can use only numbers and {outside}."
        )
    return bound


def parse_outside_bound(text, name):
    bound = parse_bound(text, f"outside integral's {name}")
    if bound.is_infinite:
        raise InputError("Infinite bounds in a double integral aren't supported yet.")
    return bound


def antiderivative_step(function, variable, antiderivative, steps):
    return make_step(
        "Find an antiderivative",
        rf"Integrate with respect to \${to_latex(variable)}$. Any antiderivative works, because "
        r"the constant cancels in the subtraction.",
        [to_latex(sympy.Integral(function, variable)), f"{to_latex(antiderivative)} + C"],
        steps,
    )


def numerical_check(function, inside, outside, inner_bounds, outer_bounds, value):
    as_numeric = numeric_function(function, (inside, outside))
    lower, upper = (numeric_function(bound, (outside,)) for bound in inner_bounds)
    with mpmath.workdps(CHECK_DIGITS):
        exact = real_value(lambda: sympy.N(value, CHECK_DIGITS))
        try:
            # real_number drops rounding-size imaginary parts at a curved edge,
            # as from √(1 − x²) evaluated just past x = 1.
            numeric = mpmath.quad(
                lambda o: mpmath.quad(
                    lambda i: real_number(as_numeric(i, o)),
                    [real_number(lower(o)), real_number(upper(o))],
                ),
                [mpmath.mpf(str(sympy.N(bound, CHECK_DIGITS))) for bound in outer_bounds],
            )
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if exact is None or numeric is None or isinstance(numeric, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
            return {
                "status": "verified",
                "detail": f"A numerical double integration gives \${shown}$, matching the exact "
                "answer.",
            }
        return {
            "status": "failed",
            "detail": f"A numerical double integration gives \${shown}$, which doesn't match. "
            "Treat this answer with caution.",
        }


def graph_samples(function, inside, outside, inner_bounds, outer_bounds):
    """The surface over a box around the region, which points are in the region,
    and the region's outline, all in (x, y) coordinates."""
    lower, upper = (numeric_function(bound, (outside,)) for bound in inner_bounds)
    a, b = (float(bound) for bound in outer_bounds)
    outside_points = [a + (b - a) * index / (OUTLINE_POINTS - 1) for index in range(OUTLINE_POINTS)]
    edges = [
        [plot_value(lambda o=o: lower(mpmath.mpf(o))) for o in outside_points],
        [plot_value(lambda o=o: upper(mpmath.mpf(o))) for o in outside_points],
    ]
    if any(value is None for edge in edges for value in edge):
        raise InputError(
            "The inside integral's bounds aren't defined along the whole outside range."
        )
    inside_min = min(min(edge) for edge in edges)
    inside_max = max(max(edge) for edge in edges)

    def padded(low, high):
        margin = max(0.1 * (high - low), 0.25)
        return low - margin, high + margin

    outside_range, inside_range = padded(a, b), padded(inside_min, inside_max)
    if outside == X:
        x_range, y_range = outside_range, inside_range
    else:
        x_range, y_range = inside_range, outside_range

    def grid(low, high):
        step = (high - low) / (GRID_SIZE - 1)
        return [round(low + step * index, 6) for index in range(GRID_SIZE)]

    xs, ys = grid(*x_range), grid(*y_range)
    as_numeric = numeric_function(function, (X, Y))

    def in_region(x, y):
        o, i = (x, y) if outside == X else (y, x)
        if not a - 1e-9 <= o <= b + 1e-9:
            return False
        low, high = (
            plot_value(lambda bound=bound: bound(mpmath.mpf(o))) for bound in (lower, upper)
        )
        if low is None or high is None:
            return False
        return min(low, high) - 1e-9 <= i <= max(low, high) + 1e-9

    def height(x, y):
        return plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y)))

    z = [[height(x, y) for x in xs] for y in ys]
    region = [[in_region(x, y) for x in xs] for y in ys]
    # The outline: along the lower edge, up the far side, back along the upper edge.
    path = [
        *zip(outside_points, edges[0]),
        *zip(reversed(outside_points), reversed(edges[1])),
        (outside_points[0], edges[0][0]),
    ]
    if outside == X:
        outline = {"x": [o for o, _ in path], "y": [i for _, i in path]}
    else:
        outline = {"x": [i for _, i in path], "y": [o for o, _ in path]}
    return {"x": xs, "y": ys, "z": z, "region": region, "outline": outline}


def double_integral(function, order, inner_texts, outer_texts):
    if order not in ORDERS:
        raise InputError("Choose the order of integration: dy dx or dx dy.")
    inside, outside = ORDERS[order]
    constants = constants_in(function, (X, Y))
    if constants:
        names = ", ".join(str(constant) for constant in constants)
        raise InputError(
            f"A double integral needs a function of x and y alone, so its answer is a number. "
            f"Remove {names}."
        )
    inner_bounds = tuple(
        parse_inside_bound(text, name, inside, outside)
        for text, name in zip(inner_texts, ("lower", "upper"))
    )
    outer_bounds = tuple(
        parse_outside_bound(text, name) for text, name in zip(outer_texts, ("lower", "upper"))
    )
    if (outer_bounds[1] - outer_bounds[0]).is_negative:
        raise InputError("The outside integral's lower bound must be at most its upper bound.")

    iterated, steps, value = iterated_integral(function, inside, outside, inner_bounds, outer_bounds)
    equation = f"{iterated} = {to_latex(value)}"
    if not value.is_Rational:
        equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(value, 15))), 6)}"
    return {
        "ok": True,
        "operation": "double",
        "equationLatex": equation,
        "check": numerical_check(function, inside, outside, inner_bounds, outer_bounds, value),
        "steps": steps,
        "stepsNote": None,
        "graph": graph_samples(function, inside, outside, inner_bounds, outer_bounds),
    }


def iterated_integral(function, inside, outside, inner_bounds, outer_bounds):
    """The iterated integral's LaTeX, its steps, and its exact value: the inside
    integral first, with the outside variable held constant, then the outside.
    Practice problems use it too."""
    report("Integrating the inside integral…")
    inner_antiderivative, _, inner_steps, _ = find_antiderivative(function, inside)
    inner_math, inner_value = evaluate_between(
        function, inner_antiderivative, *inner_bounds, inside
    )
    # The result is used only inside the region, which can make it simpler.
    simpler = simplify_on_region(inner_value, (outside,), (outer_bounds,))
    if simpler != inner_value:
        inner_math.append(to_latex(simpler))
        inner_value = simpler
    if inner_value.has(sympy.nan, sympy.zoo, sympy.oo, -sympy.oo):
        raise InputError(
            "The inside integral has no finite value everywhere on the region, so this double "
            "integral is improper, which the Solver can't do yet."
        )
    report("Integrating the outside integral…")
    outer_antiderivative, _, outer_steps, _ = find_antiderivative(inner_value, outside)
    outer_math, value = evaluate_between(inner_value, outer_antiderivative, *outer_bounds, outside)

    iterated = to_latex(sympy.Integral(function, (inside, *inner_bounds), (outside, *outer_bounds)))
    inside_name, outside_name = to_latex(inside), to_latex(outside)
    steps = [
        make_step(
            "Iterated integral",
            rf"Write the double integral over the region $R$ as an iterated integral: integrate "
            rf"with respect to \${inside_name}$ first, from \${to_latex(inner_bounds[0])}$ to "
            rf"\${to_latex(inner_bounds[1])}$, then with respect to \${outside_name}$ from "
            rf"\${to_latex(outer_bounds[0])}$ to \${to_latex(outer_bounds[1])}$.",
            [rf"\\iint_{{R}} {to_latex(function)}\\, dA", iterated],
        ),
        make_step(
            "Inside integral",
            rf"Integrate with respect to \${inside_name}$, treating \${outside_name}$ as a constant, "
            r"then subtract the antiderivative's values at the bounds.",
            inner_math,
            [antiderivative_step(function, inside, inner_antiderivative, inner_steps)],
        ),
        make_step(
            "Outside integral",
            rf"Integrate the result with respect to \${outside_name}$ and evaluate between its "
            r"bounds.",
            outer_math,
            [antiderivative_step(inner_value, outside, outer_antiderivative, outer_steps)],
        ),
    ]
    return iterated, steps, value
`,"./python/mathlab/expressions.py":`"""Shared symbols, the input error, and printing math as LaTeX."""

import sympy
from sympy.printing.latex import LatexPrinter

X = sympy.Symbol("x", real=True)
Y = sympy.Symbol("y", real=True)
Z = sympy.Symbol("z", real=True)
# The parameters of parametric and polar curves.
T = sympy.Symbol("t", real=True)
THETA = sympy.Symbol("theta", real=True)


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

# Spacing and size commands, which don't change the math (they can arrive in
# pasted LaTeX).
SPACING = {r"\\,", r"\\;", r"\\:", r"\\!", r"\\ ", r"\\quad", r"\\qquad", r"\\displaystyle", r"\\textstyle"}

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


# The lesson's slice picture: a fixed square around the point, and tangent
# lines reaching this far on each side.
SLICE_HALF_WIDTH = 2.0
TANGENT_REACH = 1.0


def curve_points(as_numeric, xs, ys):
    return {
        "x": xs,
        "y": ys,
        "z": [plot_value(lambda: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x, y in zip(xs, ys)],
    }


def slices(function, point):
    """The surface near (a, b), its slices along y = b and x = a, and their
    tangent lines, whose slopes are f_x(a, b) and f_y(a, b)."""
    if function.free_symbols - set(VARIABLES):
        raise InputError("The picture needs numbers, so use only x and y here.")
    a, b = point
    as_numeric = numeric_function(function, VARIABLES)
    xs, ys, z = sample_square(as_numeric, point, SLICE_HALF_WIDTH)
    substitutions = {X: a, Y: b}
    height = exact_real(function.subs(substitutions))
    slopes = [exact_real(sympy.diff(function, variable).subs(substitutions)) for variable in VARIABLES]
    if height is None or None in slopes:
        raise InputError("f or one of its partial derivatives isn't defined at that point. Move the point.")
    z0 = height[1]
    slope_x, slope_y = (slope[1] for slope in slopes)
    a_value, b_value = float(a), float(b)
    reach = TANGENT_REACH
    return {
        "ok": True,
        "operation": "slices",
        "surface": {"x": xs, "y": ys, "z": z, "point": [a_value, b_value, z0]},
        "xSlice": curve_points(as_numeric, xs, [b_value] * len(xs)),
        "ySlice": curve_points(as_numeric, [a_value] * len(ys), ys),
        "xTangent": {
            "x": [a_value - reach, a_value + reach],
            "y": [b_value, b_value],
            "z": [z0 - reach * slope_x, z0 + reach * slope_x],
        },
        "yTangent": {
            "x": [a_value, a_value],
            "y": [b_value - reach, b_value + reach],
            "z": [z0 - reach * slope_y, z0 + reach * slope_y],
        },
        "values": {"f": z0, "fx": slope_x, "fy": slope_y},
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
    description, example = {
        2: ("x and y", "x^2 y + sin(x y)"),
        3: ("x, y, and z", "x y z^2"),
    }.get(len(variables), ("x", "x^2 sin(x)"))
    text = text.strip()
    if not text:
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
`,"./python/mathlab/practice.py":`"""Practice problems for the lessons, and checking a student's answer.

A problem is built from its lesson and a seed. Checking rebuilds the same
problem from the seed, so the expected answer never has to leave Python.
"""

import random

import sympy

from mathlab.checks import agree_numerically
from mathlab.curves import arc_length, area, build_curve, slope_steps
from mathlab.derivative_steps import Differentiation, derivative_with_steps
from mathlab.double import iterated_integral
from mathlab.expressions import THETA, T, X, Y, Z, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import parse_function
from mathlab.space_curves import build_space_curve, curvature_steps, velocity_steps
from mathlab.triple import ORDERS, iterated_triple_integral
from mathlab.vectors import angle_result, dot_product_step, length, length_step, projection_results, vector_latex

# Answers within this relative distance count as correct, so a decimal with
# four significant digits is accepted for an answer like arccos(1/3).
DECIMAL_TOLERANCE = 5e-4


class Problem:
    def __init__(self, prompt, expected, variables, steps):
        self.prompt = prompt  # Text with inline LaTeX between $ signs.
        self.expected = expected  # The exact answer, as a SymPy expression.
        self.variables = variables  # Variables the answer may contain.
        self.steps = steps  # How to get the answer.


def nonzero_vector(rng):
    while True:
        vector = sympy.Matrix([rng.randint(-5, 5) for _ in range(3)])
        if vector != sympy.zeros(3, 1):
            return vector


def vector_problem(rng):
    a, b = nonzero_vector(rng), nonzero_vector(rng)
    dot = a.dot(b)
    vectors = rf"$\\mathbf{{a}} = {vector_latex(a)}$ and $\\mathbf{{b}} = {vector_latex(b)}$"
    kind = rng.choice(["dot", "length", "angle", "component"])
    if kind == "dot":
        return Problem(
            rf"Find $\\mathbf{{a}} \\cdot \\mathbf{{b}}$ for {vectors}.", dot, (), [dot_product_step(a, b)]
        )
    if kind == "length":
        return Problem(rf"Find $|\\mathbf{{a}}|$ for {vectors}.", length(a), (), [length_step(a, "a")])
    if kind == "angle":
        angle, step = angle_result(a, b, dot)
        return Problem(
            rf"Find the angle $\\theta$ between {vectors}, in radians (exact, or a decimal "
            r"with four significant digits).",
            angle,
            (),
            [dot_product_step(a, b), step],
        )
    scalar, _, step = projection_results(a, b, dot)
    return Problem(
        rf"Find the scalar projection $\\operatorname{{comp}}_{{\\mathbf{{b}}}} \\mathbf{{a}}$ for {vectors}.",
        scalar,
        (),
        [dot_product_step(a, b), length_step(b, "b"), step],
    )


def partial_derivative_problem(rng):
    c = rng.choice([2, 3, 4, 5])
    m = rng.choice([2, 3])
    n = rng.choice([1, 2, 3])
    function = rng.choice(
        [
            c * X**m * Y**n,
            sympy.sin(c * X * Y),
            sympy.exp(c * X) * sympy.cos(Y),
            sympy.log(X**2 + c * Y**2),
            X**m * sympy.exp(c * Y),
            (X + c * Y) ** m,
            X / (Y + c),
            X**m * Y + c * X * Y**n,
        ]
    )
    variable = rng.choice([X, Y])
    d = Differentiation(variable, partial=True)
    derivative, steps, _ = derivative_with_steps(function, d, (X, Y))
    return Problem(
        rf"Find $\\frac{{\\partial f}}{{\\partial {variable}}}$ for $f(x, y) = {to_latex(function)}$.",
        derivative,
        (X, Y),
        steps,
    )


def double_integral_problem(rng):
    """An iterated integral over a rectangle, or over a region with a curved or
    slanted edge, with an exact answer."""
    c = rng.choice([1, 2, 3])
    kind = rng.choice(["rectangle", "rectangle", "separable", "region"])
    if kind == "rectangle":
        function = rng.choice([c * X * Y**2, X**2 + c * Y, c * X**2 * Y, X + c * Y, X * Y + c])
        inside, outside = rng.choice([(Y, X), (X, Y)])
        low = rng.choice([0, 1])
        inner_bounds = (low, low + rng.choice([1, 2]))
        outer_bounds = (0, rng.choice([1, 2, 3]))
    elif kind == "separable":
        function, inside, outside, inner_bounds, outer_bounds = rng.choice(
            [
                (sympy.sin(X) * sympy.cos(Y), Y, X, (0, sympy.pi / 2), (0, sympy.pi)),
                (sympy.exp(X + Y), Y, X, (0, 1), (0, c)),
                (X * sympy.exp(Y), X, Y, (0, 2), (0, 1)),
            ]
        )
    else:
        inside, outside = rng.choice([(Y, X), (X, Y)])
        function = rng.choice([X * Y, X + Y, c * outside, inside**2 + c])
        inner_bounds = rng.choice([(0, outside), (outside**2, outside), (0, c * outside)])
        outer_bounds = (0, 1) if inner_bounds[0] != 0 else (0, rng.choice([1, 2]))
    # Exact SymPy numbers, as the Solver's bounds are.
    inner_bounds, outer_bounds = (tuple(map(sympy.sympify, bounds)) for bounds in (inner_bounds, outer_bounds))
    iterated, steps, value = iterated_integral(function, inside, outside, inner_bounds, outer_bounds)
    return Problem(rf"Evaluate \${iterated}$.", value, (), steps)


def triple_integral_problem(rng):
    """An iterated triple integral over a box, a tetrahedron, or the solid under
    a slanted plane, with an exact answer."""
    c = rng.choice([1, 2, 3])
    variables = ORDERS[rng.choice(sorted(ORDERS))]
    inner, middle, outer = variables
    kind = rng.choice(["box", "box", "tetrahedron", "under a plane"])
    if kind == "box":
        function = rng.choice([c * X * Y * Z, X + Y + Z, X**2 * Z + c * Y, c * X * Y**2, Y * Z + c])
        lows = [rng.choice([0, 1]) for _ in variables]
        bounds = [(low, low + rng.choice([1, 2])) for low in lows]
    elif kind == "tetrahedron":
        # The solid with inner + middle + outer ≤ size in the first octant.
        size = rng.choice([1, 2])
        function = rng.choice([sympy.Integer(1), X, Y, Z, c * X * Y])
        bounds = [(0, size - outer - middle), (0, size - outer), (0, size)]
    else:
        # Below the plane inner = middle + outer, over a rectangle.
        function = rng.choice([sympy.Integer(1), c * inner, middle + outer])
        bounds = [(0, middle + outer), (0, rng.choice([1, 2])), (0, rng.choice([1, 2]))]
    # Exact SymPy numbers, as the Solver's bounds are.
    bounds = [tuple(map(sympy.sympify, pair)) for pair in bounds]
    iterated, steps, (_, _, value) = iterated_triple_integral(function, variables, bounds)
    return Problem(rf"Evaluate \${iterated}$.", value, (), steps)


def curve_problem(rng):
    """The slope of a parametric curve at a point, the area inside a polar
    curve, or an arc length built so that its integral has an exact value."""
    c = rng.choice([1, 2, 3])
    pi = sympy.pi
    kind = rng.choice(["slope", "polar area", "arc length"])
    if kind == "slope":
        x, y, at = rng.choice(
            [
                (T**2, T**3 - 3 * T, rng.choice([1, 2, sympy.sqrt(3)])),
                (T**2 + c * T, T**3, rng.choice([1, 2])),
                (c * sympy.cos(T), c * sympy.sin(T), rng.choice([pi / 6, pi / 4, pi / 3])),
                (T - sympy.sin(T), 1 - sympy.cos(T), rng.choice([pi / 2, pi / 3, 2 * pi / 3])),
                (sympy.exp(T), sympy.exp(c * T), rng.choice([0, 1])),
            ]
        )
        curve = build_curve("parametric", x, y, None, (at, at), at)
        steps, _ = slope_steps(curve)
        dx0, dy0 = (derivative.subs(T, at) for derivative in (curve["dxdt"], curve["dydt"]))
        # The slope's step and the step at the point; d²y/dx² isn't asked for.
        return Problem(
            rf"Find $\\frac{{dy}}{{dx}}$ for $x = {to_latex(x)}$, $y = {to_latex(y)}$ at "
            rf"$t = {to_latex(at)}$.",
            sympy.simplify(dy0 / dx0),
            (),
            [steps[0], steps[-1]],
        )
    if kind == "polar area":
        r, low, high, region = rng.choice(
            [
                (sympy.Integer(c), 0, pi / 2, "the quarter disk"),
                (c * sympy.cos(THETA), -pi / 2, pi / 2, "the circle"),
                (1 + sympy.cos(THETA), 0, 2 * pi, "the cardioid"),
                (sympy.cos(2 * THETA), -pi / 4, pi / 4, "one loop of the rose"),
                (sympy.sin(3 * THETA), 0, pi / 3, "one loop of the rose"),
            ]
        )
        curve = build_curve("polar", r * sympy.cos(THETA), r * sympy.sin(THETA), r, (low, high))
        step, _, _, value = area(curve)
        return Problem(
            rf"Find the area of {region} $r = {to_latex(r)}$, "
            rf"\${to_latex(low)} \\le \\theta \\le {to_latex(high)}$.",
            value,
            (),
            [step],
        )
    kind, x, y, r, low, high = rng.choice(
        [
            ("parametric", c * sympy.cos(T), c * sympy.sin(T), None, 0, pi),
            ("parametric", c * (T - sympy.sin(T)), c * (1 - sympy.cos(T)), None, 0, 2 * pi),
            ("parametric", T**2, 2 * T**3 / 3, None, 0, 1),
            ("polar", None, None, c * (1 + sympy.cos(THETA)), 0, 2 * pi),
        ]
    )
    if kind == "polar":
        x, y = r * sympy.cos(THETA), r * sympy.sin(THETA)
        description = rf"$r = {to_latex(r)}$, \${to_latex(low)} \\le \\theta \\le {to_latex(high)}$"
    else:
        description = (
            rf"$x = {to_latex(x)}$, $y = {to_latex(y)}$, \${to_latex(low)} \\le t \\le {to_latex(high)}$"
        )
    curve = build_curve(kind, x, y, r, (sympy.sympify(low), sympy.sympify(high)))
    step, _, _, value = arc_length(curve)
    return Problem(rf"Find the length of the curve {description}.", value, (), [step])


def space_curve_problem(rng):
    """The speed or curvature of a space curve at a point, or an arc length
    built so that its integral has an exact value."""
    pi = sympy.pi
    a, b = rng.choice([(3, 4), (4, 3), (1, 1), (5, 12)])
    helix = (a * sympy.cos(T), a * sympy.sin(T), b * T)
    kind = rng.choice(["speed", "arc length", "curvature"])
    if kind == "speed":
        (x, y, z), at = rng.choice(
            [
                (helix, rng.choice([0, pi / 2, pi])),
                ((T, T**2, T**3), rng.choice([0, 1, 2])),
                ((sympy.exp(T), sympy.exp(-T), sympy.sqrt(2) * T), rng.choice([0, 1])),
            ]
        )
        curve = build_space_curve(x, y, z, (at, at), at)
        steps, _ = velocity_steps(curve)
        value = sympy.simplify(curve["speed"].subs(T, at))
        prompt = rf"Find the speed $|\\mathbf{{r}}'(t)|$ of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ at $t = {to_latex(at)}$."
        return Problem(prompt, value, (), steps)
    if kind == "arc length":
        (x, y, z), low, high = rng.choice(
            [
                (helix, 0, 2 * pi),
                ((sympy.exp(T), sympy.exp(-T), sympy.sqrt(2) * T), 0, 1),
                ((sympy.cos(T), sympy.sin(T), T), 0, rng.choice([pi, 2 * pi])),
            ]
        )
        curve = build_space_curve(x, y, z, (sympy.sympify(low), sympy.sympify(high)))
        step, _, _, value = arc_length(curve)
        prompt = (
            rf"Find the length of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ for "
            rf"\${to_latex(low)} \\le t \\le {to_latex(high)}$."
        )
        return Problem(prompt, value, (), [step])
    c = rng.choice([2, 3, 5])
    (x, y, z), at = rng.choice(
        [
            (helix, rng.choice([0, pi / 2])),
            ((c * sympy.cos(T), c * sympy.sin(T), sympy.Integer(0)), rng.choice([0, pi / 3])),
            ((T, T**2, T**3), 0),
            ((T, T**2, sympy.Integer(0)), rng.choice([0, 1])),
        ]
    )
    curve = build_space_curve(x, y, z, (at, at), at)
    steps, _ = velocity_steps(curve)
    step, _ = curvature_steps(curve)
    value = sympy.simplify(curve["curvature"].subs(T, at))
    prompt = rf"Find the curvature $\\kappa$ of $\\mathbf{{r}}(t) = {vector_latex((x, y, z))}$ at $t = {to_latex(at)}$."
    return Problem(prompt, value, (), [*steps, step])


GENERATORS = {
    "vectors": vector_problem,
    "partial-derivatives": partial_derivative_problem,
    "double-integrals": double_integral_problem,
    "triple-integrals": triple_integral_problem,
    "parametric-polar": curve_problem,
    "space-curves": space_curve_problem,
}


def build_problem(request):
    generator = GENERATORS.get(request.get("lesson"))
    seed = request.get("seed")
    if generator is None or not isinstance(seed, int):
        raise InputError("That practice problem doesn't exist.")
    return generator(random.Random(seed))


def practice(request):
    problem = build_problem(request)
    return {
        "ok": True,
        "operation": "practice",
        "prompt": problem.prompt,
        "variables": [variable.name for variable in problem.variables],
    }


def is_correct(answer, expected, variables):
    if sympy.simplify(answer - expected) == 0:
        return True
    if variables:
        return agree_numerically(answer, expected, variables)
    try:
        answer_value, expected_value = complex(answer.evalf(30)), complex(expected.evalf(30))
    except TypeError:  # Something symbolic remained, so it can't be compared as a number.
        return False
    return abs(answer_value - expected_value) <= DECIMAL_TOLERANCE * max(1, abs(expected_value))


def check(request):
    problem = build_problem(request)
    answer = parse_function(latex_to_text(request.get("answer", "")), problem.variables)
    correct = is_correct(answer, problem.expected, problem.variables)
    return {
        "ok": True,
        "operation": "check",
        "correct": correct,
        "answerLatex": to_latex(problem.expected),
        "yourAnswerLatex": to_latex(answer),
        "steps": problem.steps,
    }


def solution(request):
    """The answer and its steps. The page turns the steps into hints and never
    shows the answer early."""
    problem = build_problem(request)
    return {
        "ok": True,
        "operation": "solution",
        "answerLatex": to_latex(problem.expected),
        "steps": problem.steps,
    }
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
`,"./python/mathlab/region.py":`"""Help for iterated integrals over a region: sample points inside it, and
simplifying a partial result where it is used, inside the region.

An inner integral's result often comes back in a form SymPy can't simplify on
its own, because SymPy doesn't know the region. Over the unit disk, the middle
integral of the ball's volume comes back as
2(1 − x²) arcsin(√(1/(1 − x²)) √(1 − x²)), inside "if −1 < x < 1": the arcsine
is π/2 everywhere in the region, but SymPy can't assume 1 − x² > 0, and
integrating the unsimplified form gave a wrong answer. Every rewrite here is
kept only if it agrees numerically with the original at points inside the
region, and the final answer is checked independently as well.
"""

import mpmath
import sympy

# Where sample points sit inside each variable's interval, as fractions of its
# width. Rewrites are found with the first set and must also hold on the
# second, irregular one, so a wave like sin(6πx), which is 0 at every sixth,
# can't pass for a constant.
SAMPLE_FRACTIONS = [sympy.Rational(index, 6) for index in range(1, 6)]
CHECK_FRACTIONS = [sympy.Rational(n, d) for n, d in ((13, 97), (31, 89), (47, 83), (59, 79), (71, 73))]
AGREEMENT_TOLERANCE = 1e-12
# A rounding-size imaginary part, as from √(1 − x²) evaluated just outside the
# region's edge, is dropped when it is at most this fraction of the real part.
IMAGINARY_TOLERANCE = mpmath.mpf("1e-9")


def real_number(value):
    """value as a real mpf, dropping a rounding-size imaginary part."""
    if isinstance(value, mpmath.mpc) and abs(value.imag) <= IMAGINARY_TOLERANCE * max(1, abs(value.real)):
        return value.real
    return value


def sample_points(variables, bounds, fractions):
    """Exact points inside the region, as substitution dictionaries.

    variables run from the innermost of those sampled outward, and bounds[i]
    is the (lower, upper) pair of variables[i], which may use the variables
    after it. The last pair is numbers.
    """
    points = [{}]
    for variable, (low, high) in reversed(list(zip(variables, bounds))):
        next_points = []
        for point in points:
            ends = [sympy.sympify(bound).subs(point) for bound in (low, high)]
            if not all(end.is_real for end in ends) or ends[0] == ends[1]:
                continue  # Outside the region, or where it has no width.
            next_points.extend(
                {**point, variable: ends[0] + (ends[1] - ends[0]) * fraction} for fraction in fractions
            )
        points = next_points
    return points


def numeric_value(expression, point):
    try:
        return complex(expression.subs(point).evalf(30))
    except (TypeError, ValueError):  # Something symbolic remained.
        return None


def agree(first, second, points):
    for point in points:
        a, b = numeric_value(first, point), numeric_value(second, point)
        if a is None or b is None or abs(a - b) > AGREEMENT_TOLERANCE * max(1, abs(a)):
            return False
    return True


def choose_piece(expression, points):
    """The piece of a Piecewise that holds at every point, or the expression itself."""
    chosen = set()
    for point in points:
        for index, (_, condition) in enumerate(expression.args):
            holds = condition.subs(point)
            if holds is sympy.true:
                chosen.add(index)
                break
            if holds is not sympy.false:
                return expression  # Can't tell, so keep every piece.
    if len(chosen) != 1:
        return expression
    return expression.args[chosen.pop()][0]


def is_constant(expression, points):
    values = [numeric_value(expression, point) for point in points]
    if any(value is None for value in values):
        return False
    return all(abs(value - values[0]) <= AGREEMENT_TOLERANCE * max(1, abs(values[0])) for value in values)


def rewrite(expression, variables, points):
    """Replace pieces that are constant inside the region with their exact values,
    and Piecewise expressions with the piece that holds there."""
    if (
        not isinstance(expression, sympy.Expr)
        or expression.is_Atom
        or not expression.free_symbols & set(variables)
    ):
        return expression
    if isinstance(expression, sympy.Piecewise):
        piece = choose_piece(expression, points)
        # A Piecewise whose piece can't be chosen is kept whole.
        return expression if piece is expression else rewrite(piece, variables, points)
    if not expression.is_polynomial(*variables) and is_constant(expression, points):
        return sympy.simplify(expression.subs(points[0]))
    return expression.func(*(rewrite(argument, variables, points) for argument in expression.args))


def simplify_on_region(expression, variables, bounds):
    """expression, a function of variables, simplified for points inside the
    region; unchanged if no simpler form agrees with it there."""
    if not expression.free_symbols & set(variables):
        return expression
    points = sample_points(variables, bounds, SAMPLE_FRACTIONS)
    check_points = sample_points(variables, bounds, CHECK_FRACTIONS)
    if not points or not check_points:
        return expression
    try:
        simpler = sympy.simplify(rewrite(expression, variables, points))
    except Exception:  # Simplifying is optional; any failure keeps the original.
        return expression
    if simpler == expression or not agree(simpler, expression, points + check_points):
        return expression
    return simpler
`,"./python/mathlab/riemann.py":`"""The double-integrals lesson picture: a Riemann sum of boxes under z = f(x, y).

The rectangle [a, b] × [c, d] is cut into m × n small rectangles. Each one
gets a box whose height is f at a sample point in it, and the boxes' total
volume approximates the double integral, which SymPy computes exactly.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function, plot_value
from mathlab.definite import parse_bound
from mathlab.expressions import X, Y, InputError, to_latex

# Where in each small rectangle f is sampled, as fractions of its width and height.
SAMPLE_POINTS = {"lower-left": (0, 0), "midpoint": (0.5, 0.5), "upper-right": (1, 1)}
MAX_DIVISIONS = 16
SURFACE_POINT_COUNT = 31


def parse_rectangle(texts):
    """[a, b, c, d] as LaTeX, for the rectangle a ≤ x ≤ b, c ≤ y ≤ d."""
    if not (isinstance(texts, list) and len(texts) == 4):
        raise InputError("Enter the rectangle as four numbers: a, b, c, and d.")
    names = ("x lower", "x upper", "y lower", "y upper")
    bounds = [parse_bound(text, name) for text, name in zip(texts, names)]
    if any(bound.is_infinite for bound in bounds):
        raise InputError("The rectangle must be finite.")
    a, b, c, d = bounds
    if not ((b - a).is_positive and (d - c).is_positive):
        raise InputError("Each lower bound of the rectangle must be less than its upper bound.")
    return bounds


def parse_divisions(raw):
    if not (
        isinstance(raw, list)
        and len(raw) == 2
        and all(isinstance(value, int) and not isinstance(value, bool) for value in raw)
        and all(1 <= value <= MAX_DIVISIONS for value in raw)
    ):
        raise InputError(f"Cut each side into 1 to {MAX_DIVISIONS} pieces.")
    return raw


def edges(low, high, count):
    return [float(low + (high - low) * index / count) for index in range(count + 1)]


def riemann_sum(function, rectangle_texts, divisions, sample):
    if function.free_symbols - {X, Y}:
        raise InputError("The picture needs numbers, so use only x and y here.")
    if sample not in SAMPLE_POINTS:
        raise InputError("Choose where to sample f: lower-left corner, midpoint, or upper-right corner.")
    a, b, c, d = parse_rectangle(rectangle_texts)
    m, n = parse_divisions(divisions)
    as_numeric = numeric_function(function, (X, Y))
    x_edges, y_edges = edges(a, b, m), edges(c, d, n)
    s, t = SAMPLE_POINTS[sample]
    sample_x = [x_edges[i] + s * (x_edges[i + 1] - x_edges[i]) for i in range(m)]
    sample_y = [y_edges[j] + t * (y_edges[j + 1] - y_edges[j]) for j in range(n)]

    # One row of box heights per strip in y, like the surface rows.
    heights = [
        [plot_value(lambda x=x, y=y: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in sample_x]
        for y in sample_y
    ]
    if any(height is None for row in heights for height in row):
        raise InputError("f isn't defined at every sample point, so the boxes can't be drawn.")
    box_area = float((b - a) * (d - c)) / (m * n)
    total = box_area * sum(sum(row) for row in heights)

    exact = sympy.integrate(function, (X, a, b), (Y, c, d))
    exact_value = plot_value(lambda: sympy.N(exact, 20))
    if exact_value is None:
        raise InputError("The double integral over this rectangle has no finite value.")

    xs, ys = edges(a, b, SURFACE_POINT_COUNT - 1), edges(c, d, SURFACE_POINT_COUNT - 1)
    surface = [[plot_value(lambda x=x, y=y: as_numeric(mpmath.mpf(x), mpmath.mpf(y))) for x in xs] for y in ys]
    return {
        "ok": True,
        "operation": "riemann",
        "sample": sample,
        "xEdges": x_edges,
        "yEdges": y_edges,
        "sampleX": sample_x,
        "sampleY": sample_y,
        "heights": heights,
        "boxArea": box_area,
        "sum": total,
        "exact": exact_value,
        "exactLatex": to_latex(exact),
        "surface": {"x": xs, "y": ys, "z": surface},
    }
`,"./python/mathlab/solid.py":`"""The triple-integrals lesson picture: a solid E, a slice of it, and a line
through the slice.

The solid is given as a triple integral's bounds. Fixing the outermost
variable cuts a slice; fixing the middle variable too leaves a line across
the slice. With f = 1, the innermost integral is the line's length, the
middle integral is the slice's area, and the outermost integral is the
solid's volume. Every slider position is computed here at once, so moving
a slider needs no new request.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.expressions import X, Y, Z, InputError, to_latex
from mathlab.region import real_number
from mathlab.triple import ORDERS, iterated_triple_integral, parse_bounds

# Slider positions: the outermost variable takes OUTER_STEPS + 1 values, and
# the middle variable MIDDLE_STEPS + 1 values across each slice.
OUTER_STEPS = 20
MIDDLE_STEPS = 20
# Grid points along each side of the boundary surfaces.
SURFACE_POINTS = 25
DIGITS = 5


def as_float(compute):
    """compute()'s value as a float, or None where it has no real value."""
    try:
        value = real_number(mpmath.mpmathify(compute()))
    except Exception:  # Undefined points raise many error types; all mean "no value here".
        return None
    if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
        return None
    # Rounded, which keeps the reply small; the picture needs no more digits.
    return round(float(value), DIGITS)


def fractions(steps):
    return [index / steps for index in range(steps + 1)]


class Solid:
    """The bounds as numeric functions, and a way to place a point
    (outer, middle, inner) at its (x, y, z) coordinates."""

    def __init__(self, variables, bounds):
        inner, middle, outer = variables
        self.inner_low, self.inner_high = (numeric_function(b, (middle, outer)) for b in bounds[0])
        self.middle_low, self.middle_high = (numeric_function(b, (outer,)) for b in bounds[1])
        self.outer_low, self.outer_high = (float(sympy.N(b)) for b in bounds[2])
        # Where each of x, y, z sits in (outer, middle, inner).
        self.axis = [(outer, middle, inner).index(symbol) for symbol in (X, Y, Z)]

    def outer_at(self, s):
        return self.outer_low + s * (self.outer_high - self.outer_low)

    def middle_at(self, o, t):
        low = as_float(lambda: self.middle_low(o))
        high = as_float(lambda: self.middle_high(o))
        if low is None or high is None:
            return None
        return low + t * (high - low)

    def inner_range(self, m, o):
        if m is None:
            return None, None
        return as_float(lambda: self.inner_low(m, o)), as_float(lambda: self.inner_high(m, o))

    def place(self, o, m, n):
        """(x, y, z) for the point whose outer, middle, and inner values are o, m, n."""
        values = (o, m, n)
        if None in values:
            return None, None, None
        return tuple(round(values[index], DIGITS) for index in self.axis)


def grid(solid, point_at):
    """A parametric surface: point_at(u, v) over [0, 1]², as x, y, z rows."""
    rows = [[point_at(u, v) for u in fractions(SURFACE_POINTS - 1)] for v in fractions(SURFACE_POINTS - 1)]
    return {
        name: [[point[index] for point in row] for row in rows]
        for index, name in enumerate(("x", "y", "z"))
    }


def boundary(solid):
    """The solid's surface: its bottom and top (innermost bounds), and walls
    standing on the four edges of the region the middle and outer bounds trace."""

    def on_region(s, t, w=None, level=None):
        o = solid.outer_at(s)
        m = solid.middle_at(o, t)
        low, high = solid.inner_range(m, o)
        if low is None or high is None:
            return None, None, None
        n = {"bottom": low, "top": high}.get(level, None if w is None else low + w * (high - low))
        return solid.place(o, m, n)

    return [
        grid(solid, lambda s, t: on_region(s, t, level="bottom")),
        grid(solid, lambda s, t: on_region(s, t, level="top")),
        grid(solid, lambda s, w: on_region(s, 0, w)),
        grid(solid, lambda s, w: on_region(s, 1, w)),
        grid(solid, lambda t, w: on_region(0, t, w)),
        grid(solid, lambda t, w: on_region(1, t, w)),
    ]


def solid_picture(order, bound_texts):
    if order not in ORDERS:
        raise InputError("Choose the order of integration, such as dz dy dx.")
    variables = ORDERS[order]
    bounds = parse_bounds(variables, bound_texts)
    _, _, (line_length, slice_area, volume) = iterated_triple_integral(sympy.Integer(1), variables, bounds)
    _, middle, outer = variables
    length_at = numeric_function(line_length, (middle, outer))
    area_at = numeric_function(slice_area, (outer,))
    solid = Solid(variables, bounds)

    positions = []
    for s in fractions(OUTER_STEPS):
        o = solid.outer_at(s)
        lines = []
        for t in fractions(MIDDLE_STEPS):
            m = solid.middle_at(o, t)
            low, high = solid.inner_range(m, o)
            lines.append(
                {
                    "middle": None if m is None else round(m, DIGITS),
                    "ends": [list(solid.place(o, m, low)), list(solid.place(o, m, high))],
                    "length": as_float(lambda m=m: length_at(m, o)) if m is not None else None,
                }
            )
        # The slice: the region the lines sweep, as two rows (their low and high ends).
        slice_surface = {
            name: [[line["ends"][end][index] for line in lines] for end in (0, 1)]
            for index, name in enumerate(("x", "y", "z"))
        }
        positions.append(
            {
                "outer": round(o, DIGITS),
                "area": as_float(lambda: area_at(o)),
                "slice": slice_surface,
                "lines": lines,
            }
        )

    volume_value = as_float(lambda: sympy.N(volume, 20))
    if volume_value is None:
        raise InputError("This solid's volume has no finite value.")
    return {
        "ok": True,
        "operation": "solid",
        "variables": [str(variable) for variable in variables],
        "surfaces": boundary(solid),
        "positions": positions,
        "volume": volume_value,
        "volumeLatex": to_latex(volume),
    }
`,"./python/mathlab/space_curves.py":`"""Space curves: vector functions r(t) = ⟨x(t), y(t), z(t)⟩.

The velocity r'(t) points along the curve, and its length is the speed.
Dividing by the speed gives the unit tangent T; the arc length integrates
the speed (with the same exact-or-numerical approach as plane curves); and
the curvature κ = |r' × r''| / |r'|³ measures how fast T turns per unit of
length. The unit normal N points the way the curve bends.
"""

import mpmath
import sympy

from mathlab.checks import numeric_function
from mathlab.curves import arc_length, latex_value, numerical_integral, parse_curve_function, parse_interval
from mathlab.definite import parse_bound
from mathlab.expressions import T, InputError, to_latex
from mathlab.progress import report
from mathlab.region import real_number
from mathlab.steps import make_step
from mathlab.vectors import vector_latex

GRAPH_POINTS = 401
TRACE_STEPS = 120


def build_space_curve(x, y, z, interval, at=None):
    velocity = sympy.Matrix([sympy.diff(component, T) for component in (x, y, z)])
    return {
        "kind": "space",
        "parameter": T,
        "position": sympy.Matrix([x, y, z]),
        "velocity": velocity,
        "acceleration": velocity.diff(T),
        "dxdt": velocity[0],
        "dydt": velocity[1],
        "dzdt": velocity[2],
        "interval": interval,
        "at": at,
    }


def space_curve_from_request(request):
    x, y, z = (
        parse_curve_function(request.get(key), name, T)
        for key, name in (("xExpression", "x(t)"), ("yExpression", "y(t)"), ("zExpression", "z(t)"))
    )
    low, high = parse_interval(request.get("lower"), request.get("upper"), T)
    at = None
    at_text = request.get("at")
    if isinstance(at_text, str) and at_text.strip():
        at = parse_bound(at_text, "point's t")
        if at.is_infinite:
            raise InputError("The point's t must be a number.")
    return build_space_curve(x, y, z, (low, high), at)


# Expressions with more operations than this aren't simplified: on formulas
# like the curvature of a curve with e^t and sin 2t, SymPy takes many seconds
# and finds little shorter. Textbook curves give small expressions, which are,
# and so are plain numbers (values at one point), which simplify quickly.
SIMPLIFY_LIMIT = 30


def tidy(expression):
    if expression.free_symbols and sympy.count_ops(expression) > SIMPLIFY_LIMIT:
        return expression
    return sympy.simplify(expression)


def magnitude(vector):
    return sympy.sqrt(tidy(vector.dot(vector)))


def simplified(vector):
    return vector.applyfunc(tidy)


def velocity_steps(curve):
    """r'(t), r''(t), and the speed |r'(t)|: the steps and the results."""
    velocity, acceleration = curve["velocity"], curve["acceleration"]
    speed = tidy(magnitude(velocity))
    curve["speed"] = speed
    steps = [
        make_step(
            "Velocity",
            r"Differentiate each component: the derivative of a vector function is the vector of "
            r"its components' derivatives. It points along the curve, in the direction of motion.",
            [rf"\\mathbf{{r}}'(t) = {vector_latex(velocity)}"],
        ),
        make_step(
            "Speed",
            r"The speed is the length of the velocity vector, $|\\mathbf{r}'(t)| = \\sqrt{x'^2 + y'^2 + z'^2}$.",
            [rf"|\\mathbf{{r}}'(t)| = \\sqrt{{{to_latex(sympy.expand(velocity.dot(velocity)))}}}", to_latex(speed)],
        ),
    ]
    results = [
        {"label": "Velocity", "latex": rf"\\mathbf{{r}}'(t) = {vector_latex(velocity)}"},
        {"label": "Speed", "latex": rf"|\\mathbf{{r}}'(t)| = {to_latex(speed)}"},
        {"label": "Acceleration", "latex": rf"\\mathbf{{r}}''(t) = {vector_latex(acceleration)}"},
    ]
    return steps, results


def curvature_steps(curve):
    """The curvature κ(t): its step, its result, and its value as a function of t."""
    velocity, acceleration, speed = curve["velocity"], curve["acceleration"], curve["speed"]
    cross = simplified(velocity.cross(acceleration))
    cross_length = tidy(magnitude(cross))
    curvature = tidy(cross_length / speed**3)
    step = make_step(
        "Curvature",
        r"Curvature measures how fast the direction turns per unit of length: "
        r"$\\kappa = \\left|\\frac{d\\mathbf{T}}{ds}\\right|$. In terms of $t$ it is "
        r"$\\kappa = \\frac{|\\mathbf{r}' \\times \\mathbf{r}''|}{|\\mathbf{r}'|^3}$: the cross product "
        r"keeps the part of the acceleration that turns the curve and drops the part that only "
        r"changes the speed.",
        [
            rf"\\mathbf{{r}}' \\times \\mathbf{{r}}'' = {vector_latex(cross)}",
            rf"\\kappa(t) = \\frac{{|\\mathbf{{r}}' \\times \\mathbf{{r}}''|}}{{|\\mathbf{{r}}'|^3}} = "
            rf"\\frac{{{to_latex(cross_length)}}}{{\\left({to_latex(speed)}\\right)^3}}",
            to_latex(curvature),
        ],
    )
    curve["curvature"] = curvature
    return step, {"label": "Curvature", "latex": rf"\\kappa(t) = {to_latex(curvature)}"}


def point_steps(curve):
    """At the chosen t: the point, T, κ, and N. Steps and results."""
    at = curve["at"]
    at_text = rf"t = {to_latex(at)}"
    point = simplified(curve["position"].subs(T, at))
    velocity = simplified(curve["velocity"].subs(T, at))
    acceleration = simplified(curve["acceleration"].subs(T, at))
    speed = tidy(magnitude(velocity))
    curve["point"] = (point, velocity, None)
    results = [{"label": "Point", "latex": rf"\\mathbf{{r}}({to_latex(at)}) = {vector_latex(point)}"}]
    if speed == 0:
        step = make_step(
            "Unit tangent vector",
            rf"The velocity is $\\mathbf{{0}}$ at \${at_text}$: the point stops for an instant, so it "
            r"has no direction there, and $\\mathbf{T}$, $\\kappa$, and $\\mathbf{N}$ aren't defined.",
            [rf"\\mathbf{{r}}'({to_latex(at)}) = \\mathbf{{0}}"],
        )
        results.append({"label": "Unit tangent", "latex": r"\\text{undefined: } \\mathbf{r}' = \\mathbf{0}"})
        return [step], results
    tangent = simplified(velocity / speed)
    steps = [
        make_step(
            "Unit tangent vector",
            r"Divide the velocity by its length, which keeps its direction and makes its length 1: "
            r"$\\mathbf{T} = \\frac{\\mathbf{r}'}{|\\mathbf{r}'|}$.",
            [
                rf"\\mathbf{{r}}'({to_latex(at)}) = {vector_latex(velocity)}, \\quad |\\mathbf{{r}}'({to_latex(at)})| = {to_latex(speed)}",
                rf"\\mathbf{{T}}({to_latex(at)}) = {vector_latex(tangent)}",
            ],
        )
    ]
    results.append({"label": "Unit tangent", "latex": rf"\\mathbf{{T}}({to_latex(at)}) = {vector_latex(tangent)}"})
    curvature = sympy.simplify(curve["curvature"].subs(T, at))
    steps.append(
        make_step(
            "Curvature at a point",
            rf"Put \${to_latex(at)}$ in for $t$ in $\\kappa(t)$. The circle that fits the curve best "
            r"here, the osculating circle, has radius $\\frac{1}{\\kappa}$.",
            [rf"\\kappa({to_latex(at)}) = {latex_value(curvature)}"],
        )
    )
    results.append({"label": "Curvature at the point", "latex": rf"\\kappa({to_latex(at)}) = {latex_value(curvature)}"})
    # The part of the acceleration across the direction of motion turns the
    # curve, and it points along N.
    across = simplified(acceleration - acceleration.dot(tangent) * tangent)
    across_length = tidy(magnitude(across))
    if across_length == 0:
        steps.append(
            make_step(
                "Unit normal vector",
                r"The curvature is $0$ here: the curve is straight for an instant, so it doesn't "
                r"bend toward any side, and $\\mathbf{N}$ isn't defined.",
                [],
            )
        )
        results.append({"label": "Unit normal", "latex": r"\\text{undefined: } \\kappa = 0"})
        return steps, results
    normal = simplified(across / across_length)
    curve["point"] = (point, velocity, normal)
    steps.append(
        make_step(
            "Unit normal vector",
            r"$\\mathbf{N} = \\frac{\\mathbf{T}'}{|\\mathbf{T}'|}$ points the way the curve bends. It is "
            r"also the direction of the part of the acceleration perpendicular to the motion, "
            r"$\\mathbf{r}'' - (\\mathbf{r}'' \\cdot \\mathbf{T})\\mathbf{T}$, which is easier to compute "
            r"at one point.",
            [
                rf"\\mathbf{{r}}'' - (\\mathbf{{r}}'' \\cdot \\mathbf{{T}})\\mathbf{{T}} = {vector_latex(across)}",
                rf"\\mathbf{{N}}({to_latex(at)}) = {vector_latex(normal)}",
            ],
        )
    )
    results.append({"label": "Unit normal", "latex": rf"\\mathbf{{N}}({to_latex(at)}) = {vector_latex(normal)}"})
    return steps, results


def numeric_value(function, point):
    try:
        value = real_number(mpmath.mpmathify(function(mpmath.mpf(point))))
    except Exception:  # Undefined points raise many error types; all mean "no value".
        return None
    if isinstance(value, mpmath.mpc) or not mpmath.isfinite(value):
        return None
    return round(float(value), 6)


def curve_points(curve, count):
    """count parameter values across the interval, and the curve's x, y, z there."""
    low, high = (float(sympy.N(bound)) for bound in curve["interval"])
    parameters = [low + (high - low) * index / (count - 1) for index in range(count)]
    functions = [numeric_function(component, (T,)) for component in curve["position"]]
    return parameters, [[numeric_value(function, t) for t in parameters] for function in functions]


def graph_samples(curve):
    _, (xs, ys, zs) = curve_points(curve, GRAPH_POINTS)
    graph = {"x": xs, "y": ys, "z": zs, "point": None, "tangent": None, "normal": None}
    if curve.get("point"):
        point, velocity, normal = curve["point"]
        graph["point"] = [float(sympy.N(component)) for component in point]
        speed = float(sympy.N(magnitude(velocity)))
        if speed > 0:
            graph["tangent"] = [float(sympy.N(component)) / speed for component in velocity]
        if normal is not None:
            graph["normal"] = [float(sympy.N(component)) for component in normal]
    return graph


def analyze_space_curve(request):
    curve = space_curve_from_request(request)
    low, high = curve["interval"]
    report("Finding the velocity…")
    steps, results = velocity_steps(curve)
    report("Finding the curvature…")
    curvature_step, curvature_result = curvature_steps(curve)
    steps.append(curvature_step)
    results.append(curvature_result)
    if curve["at"] is not None:
        point_step_list, point_results = point_steps(curve)
        steps.extend(point_step_list)
        results.extend(point_results)
    report("Finding the arc length…")
    length_step, length_result, length_check, _ = arc_length(curve)
    steps.append(length_step)
    results.append(length_result)
    position = curve["position"]
    return {
        "ok": True,
        "operation": "space",
        "curveLatex": rf"\\mathbf{{r}}(t) = {vector_latex(position)}, \\quad {to_latex(low)} \\le t \\le {to_latex(high)}",
        "results": results,
        "checks": [{"label": "Arc length", "check": length_check}],
        "steps": steps,
        "graph": graph_samples(curve),
    }


def space_trace(request):
    """The lesson picture: for TRACE_STEPS + 1 values of t, the point, T, N,
    the curvature, and the length so far, all computed numerically."""
    curve = space_curve_from_request(request)
    velocity, acceleration = curve["velocity"], curve["acceleration"]
    velocity_at = [numeric_function(component, (T,)) for component in velocity]
    acceleration_at = [numeric_function(component, (T,)) for component in acceleration]
    speed = numeric_function(magnitude(velocity), (T,))
    parameters, (xs, ys, zs) = curve_points(curve, TRACE_STEPS + 1)
    samples = []
    length = 0.0
    for index, t in enumerate(parameters):
        if index > 0:
            length += float(numerical_integral(speed, [parameters[index - 1], t]) or 0)
        v = [numeric_value(function, t) for function in velocity_at]
        a = [numeric_value(function, t) for function in acceleration_at]
        sample = {"t": round(t, 6), "point": [xs[index], ys[index], zs[index]], "length": round(length, 6)}
        sample.update(frame(v, a))
        samples.append(sample)
    _, (cx, cy, cz) = curve_points(curve, GRAPH_POINTS)
    return {"ok": True, "operation": "spaceTrace", "samples": samples, "curve": {"x": cx, "y": cy, "z": cz}}


def frame(v, a):
    """T, N, and κ from the velocity v and acceleration a at one point, as floats;
    None where they aren't defined."""
    empty = {"tangent": None, "normal": None, "curvature": None}
    if None in v or None in a:
        return empty
    speed = sum(c * c for c in v) ** 0.5
    if speed < 1e-12:
        return empty
    tangent = [c / speed for c in v]
    along = sum(ai * ti for ai, ti in zip(a, tangent))
    across = [ai - along * ti for ai, ti in zip(a, tangent)]
    across_length = sum(c * c for c in across) ** 0.5
    # κ = |v × a| / |v|³, and |v × a| = |v| times the part of a across v.
    curvature = across_length / speed**2
    normal = [c / across_length for c in across] if across_length > 1e-12 else None
    return {"tangent": rounded(tangent), "normal": rounded(normal), "curvature": round(curvature, 6)}


def rounded(vector):
    return None if vector is None else [round(component, 6) for component in vector]
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
`,"./python/mathlab/triple.py":`"""Triple integrals, as iterated integrals (Fubini's theorem in three dimensions).

The innermost integral is taken first, with the two other variables held
constant, and its bounds may depend on both of them. The middle integral's
bounds may depend on the outermost variable, and the outermost bounds are
numbers. Together the bounds describe a solid region E. The value is checked
with a numerical triple integration.
"""

import mpmath
import sympy

from mathlab.antiderivatives import find_antiderivative
from mathlab.checks import numeric_function
from mathlab.definite import INFINITY, evaluate_between, parse_bound
from mathlab.double import antiderivative_step
from mathlab.expressions import X, Y, Z, InputError, to_latex
from mathlab.latex_input import latex_to_text
from mathlab.parsing import constants_in, parse_function
from mathlab.progress import report
from mathlab.region import real_number, simplify_on_region
from mathlab.steps import make_step

# The order of integration: (innermost, middle, outermost) variables.
ORDERS = {
    "dz dy dx": (Z, Y, X),
    "dz dx dy": (Z, X, Y),
    "dy dz dx": (Y, Z, X),
    "dy dx dz": (Y, X, Z),
    "dx dz dy": (X, Z, Y),
    "dx dy dz": (X, Y, Z),
}
LEVELS = ("innermost", "middle", "outermost")
CHECK_DIGITS = 15
CHECK_TOLERANCE = mpmath.mpf("1e-9")
# The fast numerical method is trusted when it estimates its own error below this.
FAST_METHOD_TOLERANCE = mpmath.mpf("1e-12")


def names(variables):
    return " and ".join(str(variable) for variable in variables)


def parse_dependent_bound(text, name, level, variable, allowed):
    """A bound that is a number or an expression in the allowed outer variables."""
    if not isinstance(text, str) or text.strip() == "":
        raise InputError(f"Enter the {name} bound of the {level} integral.")
    if INFINITY.search(text):
        raise InputError("Infinite bounds in a triple integral aren't supported yet.")
    try:
        bound = parse_function(latex_to_text(text), allowed)
    except InputError as error:
        raise InputError(f"The {level} integral's {name} bound: {error}") from error
    used = {str(symbol) for symbol in bound.free_symbols}
    if str(variable) in used:
        raise InputError(
            f"The {level} integral's bounds can depend on {names(allowed)} but not on "
            f"{variable}, the variable it integrates."
        )
    if used - {str(symbol) for symbol in allowed}:
        raise InputError(
            f"The {level} integral's {name} bound can use only numbers and {names(allowed)}."
        )
    return bound


def parse_outermost_bound(text, name):
    bound = parse_bound(text, f"outermost integral's {name}")
    if bound.is_infinite:
        raise InputError("Infinite bounds in a triple integral aren't supported yet.")
    return bound


def parse_bounds(variables, texts):
    """The bounds of each integral, innermost first, as (lower, upper) pairs."""
    _, middle, outer = variables
    allowed = {"innermost": (middle, outer), "middle": (outer,)}
    bounds = []
    for level, variable, pair in zip(LEVELS[:2], variables, texts):
        bounds.append(
            tuple(
                parse_dependent_bound(text, name, level, variable, allowed[level])
                for text, name in zip(pair, ("lower", "upper"))
            )
        )
    outer_bounds = tuple(
        parse_outermost_bound(text, name) for text, name in zip(texts[2], ("lower", "upper"))
    )
    if (outer_bounds[1] - outer_bounds[0]).is_negative:
        raise InputError("The outermost integral's lower bound must be at most its upper bound.")
    bounds.append(outer_bounds)
    return bounds


def integrate_level(function, variable, low, high, rule, explanation, region=None):
    """One integral of the three: its step and its value. region holds the outer
    variables and their bounds, where the value is used and can be simplified."""
    antiderivative, _, steps, _ = find_antiderivative(function, variable)
    math, value = evaluate_between(function, antiderivative, low, high, variable)
    if region is not None:
        simpler = simplify_on_region(value, *region)
        if simpler != value:
            math.append(to_latex(simpler))
            value = simpler
    if value.has(sympy.nan, sympy.zoo, sympy.oo, -sympy.oo):
        raise InputError(
            "One of the integrals has no finite value everywhere on the region, so this triple "
            "integral is improper, which the Solver can't do yet."
        )
    step = make_step(
        rule, explanation, math, [antiderivative_step(function, variable, antiderivative, steps)]
    )
    return step, value


def nested_quad(as_numeric, interval_functions, outer_interval, method):
    """The triple integral computed numerically, and the largest error estimate of
    any of its one-variable integrals."""
    inner_interval, middle_interval = interval_functions
    largest_error = [mpmath.mpf(0)]

    def quad(integrand, interval):
        result, error = mpmath.quad(integrand, interval, method=method, error=True)
        largest_error[0] = max(largest_error[0], abs(error))
        return result

    total = quad(
        lambda o: quad(
            lambda m: quad(lambda i: real_number(as_numeric(i, m, o)), inner_interval(m, o)),
            middle_interval(o),
        ),
        outer_interval,
    )
    return total, largest_error[0]


def numerical_check(function, variables, bounds, value):
    inner, middle, outer = variables
    as_numeric = numeric_function(function, (inner, middle, outer))
    inner_low, inner_high = (numeric_function(bound, (middle, outer)) for bound in bounds[0])
    middle_low, middle_high = (numeric_function(bound, (outer,)) for bound in bounds[1])
    interval_functions = (
        lambda m, o: [real_number(inner_low(m, o)), real_number(inner_high(m, o))],
        lambda o: [real_number(middle_low(o)), real_number(middle_high(o))],
    )
    with mpmath.workdps(CHECK_DIGITS):
        outer_interval = [mpmath.mpf(str(sympy.N(bound, CHECK_DIGITS))) for bound in bounds[2]]
        try:
            exact = mpmath.mpmathify(sympy.N(value, CHECK_DIGITS))
            # Gauss-Legendre is very fast on smooth functions; when it isn't sure
            # of its answer (as at a sphere's edge), tanh-sinh is slower but
            # handles such edges well.
            numeric, error = nested_quad(as_numeric, interval_functions, outer_interval, "gauss-legendre")
            if error > FAST_METHOD_TOLERANCE * max(1, abs(numeric)):
                numeric, _ = nested_quad(as_numeric, interval_functions, outer_interval, "tanh-sinh")
        except Exception:  # Numerical integration fails in many ways; all mean "unchecked".
            numeric = None
        if numeric is None or isinstance(numeric, mpmath.mpc) or isinstance(exact, mpmath.mpc):
            return {"status": "unchecked", "detail": "The answer couldn't be checked numerically."}
        shown = mpmath.nstr(numeric, 10).removesuffix(".0")
        if abs(numeric - exact) <= CHECK_TOLERANCE * max(1, abs(exact)):
            return {
                "status": "verified",
                "detail": f"A numerical triple integration gives \${shown}$, matching the exact "
                "answer.",
            }
        return {
            "status": "failed",
            "detail": f"A numerical triple integration gives \${shown}$, which doesn't match. "
            "Treat this answer with caution.",
        }


def iterated_triple_integral(function, variables, bounds):
    """The iterated integral's LaTeX, its steps, and its values: the innermost
    integral (a function of the middle and outermost variables), the middle
    integral (a function of the outermost variable), and the exact value."""
    inner, middle, outer = variables
    latex = [to_latex(variable) for variable in variables]
    iterated = to_latex(
        sympy.Integral(function, *((variable, *pair) for variable, pair in zip(variables, bounds)))
    )

    def interval(pair):
        return rf"from \${to_latex(pair[0])}$ to \${to_latex(pair[1])}$"

    steps = [
        make_step(
            "Iterated triple integral",
            rf"Write the triple integral over the solid $E$ as an iterated integral: integrate "
            rf"with respect to \${latex[0]}$ first, {interval(bounds[0])}; then \${latex[1]}$ "
            rf"{interval(bounds[1])}; then \${latex[2]}$ {interval(bounds[2])}.",
            [rf"\\iiint_{{E}} {to_latex(function)}\\, dV", iterated],
        )
    ]
    report("Integrating the innermost integral…")
    step, inner_value = integrate_level(
        function,
        inner,
        *bounds[0],
        "Innermost integral",
        rf"Integrate with respect to \${latex[0]}$, treating \${latex[1]}$ and \${latex[2]}$ as "
        r"constants, then subtract the antiderivative's values at the bounds.",
        region=((middle, outer), bounds[1:]),
    )
    steps.append(step)
    report("Integrating the middle integral…")
    step, middle_value = integrate_level(
        inner_value,
        middle,
        *bounds[1],
        "Middle integral",
        rf"Integrate the result with respect to \${latex[1]}$, treating \${latex[2]}$ as a "
        r"constant, and evaluate between its bounds.",
        region=((outer,), bounds[2:]),
    )
    steps.append(step)
    report("Integrating the outermost integral…")
    step, value = integrate_level(
        middle_value,
        outer,
        *bounds[2],
        "Outermost integral",
        rf"Integrate the result with respect to \${latex[2]}$ and evaluate between its bounds.",
    )
    steps.append(step)
    return iterated, steps, (inner_value, middle_value, value)


def triple_integral(function, order, bound_texts):
    """bound_texts holds (lower, upper) LaTeX pairs, innermost integral first."""
    if order not in ORDERS:
        raise InputError("Choose the order of integration, such as dz dy dx.")
    variables = ORDERS[order]
    constants = constants_in(function, (X, Y, Z))
    if constants:
        raise InputError(
            f"A triple integral needs a function of x, y, and z alone, so its answer is a "
            f"number. Remove {', '.join(str(constant) for constant in constants)}."
        )
    bounds = parse_bounds(variables, bound_texts)
    iterated, steps, (_, _, value) = iterated_triple_integral(function, variables, bounds)
    equation = f"{iterated} = {to_latex(value)}"
    if not value.is_Rational:
        equation += rf" \\approx {mpmath.nstr(mpmath.mpf(str(sympy.N(value, 15))), 6)}"
    report("Checking the answer numerically…")
    return {
        "ok": True,
        "operation": "triple",
        "equationLatex": equation,
        "check": numerical_check(function, variables, bounds, value),
        "steps": steps,
        "stepsNote": None,
    }
`,"./python/mathlab/vectors.py":`"""Vectors in 3D: length, dot product, angle, and projection, with steps."""

import math

import sympy

from mathlab.expressions import InputError, factor_latex, to_latex
from mathlab.parsing import parse_function
from mathlab.steps import make_step


def parse_vector(components, name):
    """Three components, each a number like 2, -1/2, or sqrt(3), as exact values."""
    if not isinstance(components, list) or len(components) != 3:
        raise InputError(f"Enter three components for {name}.")
    values = []
    for text in components:
        if not isinstance(text, str) or not text.strip():
            raise InputError(f"Fill in every component of {name}.")
        value = parse_function(text, variables=())
        if value.free_symbols:
            raise InputError(f"The components of {name} must be numbers, like 2, -1/2, or sqrt(3).")
        values.append(value)
    return sympy.Matrix(values)


def vector_latex(vector):
    return rf"\\langle {', '.join(to_latex(component) for component in vector)} \\rangle"


def length(vector):
    return sympy.sqrt(sympy.expand(vector.dot(vector)))


def degrees(angle):
    return f"{math.degrees(float(angle)):.4g}"


def length_step(vector, name):
    squares = " + ".join(f"{factor_latex(component)}^{{2}}" for component in vector)
    return make_step(
        f"Length of {name}",
        rf"The length is the square root of the sum of the squared components: "
        rf"$|\\mathbf{{v}}| = \\sqrt{{v_1^2 + v_2^2 + v_3^2}}$.",
        [rf"|\\mathbf{{{name}}}|", rf"\\sqrt{{{squares}}}", to_latex(length(vector))],
    )


def dot_product_step(a, b):
    products = " + ".join(f"{factor_latex(x)} {factor_latex(y)}" for x, y in zip(a, b))
    return make_step(
        "Dot product",
        r"Multiply matching components and add: "
        r"$\\mathbf{a} \\cdot \\mathbf{b} = a_1 b_1 + a_2 b_2 + a_3 b_3$.",
        [r"\\mathbf{a} \\cdot \\mathbf{b}", products, to_latex(sympy.simplify(a.dot(b)))],
    )


def angle_result(a, b, dot):
    """The angle between a and b, or a note when it is undefined."""
    if length(a) == 0 or length(b) == 0:
        return None, make_step(
            "Angle",
            "A zero vector has no direction, so the angle between the vectors is undefined.",
            [],
        )
    cosine = sympy.radsimp(sympy.simplify(dot / (length(a) * length(b))))
    angle = sympy.acos(cosine)
    if dot == 0:
        note = r" Because $\\mathbf{a} \\cdot \\mathbf{b} = 0$, the vectors are perpendicular."
    elif abs(cosine) == 1:
        note = " Because the cosine is ±1, the vectors are parallel."
    else:
        note = ""
    step = make_step(
        "Angle between the vectors",
        r"From $\\mathbf{a} \\cdot \\mathbf{b} = |\\mathbf{a}| |\\mathbf{b}| \\cos\\theta$, "
        rf"$\\cos\\theta = \\frac{{\\mathbf{{a}} \\cdot \\mathbf{{b}}}}{{|\\mathbf{{a}}| |\\mathbf{{b}}|}}$.{note}",
        [
            r"\\cos\\theta",
            rf"\\frac{{{to_latex(dot)}}}{{{factor_latex(length(a))} \\cdot {factor_latex(length(b))}}}",
            to_latex(cosine),
        ],
        [
            make_step(
                "Solve for the angle",
                r"Take the inverse cosine; $\\theta$ is between $0$ and $\\pi$.",
                [r"\\theta", to_latex(angle), rf"{degrees(angle)}^\\circ"],
            )
        ],
    )
    return angle, step


def projection_results(a, b, dot):
    """The scalar and vector projections of a onto b, or None if b is zero."""
    length_b = length(b)
    if length_b == 0:
        return None
    scalar = sympy.radsimp(dot / length_b)
    vector = (dot / length_b**2) * b
    step = make_step(
        "Projection of a onto b",
        r"The part of $\\mathbf{a}$ that points along $\\mathbf{b}$. The scalar projection is "
        r"$\\operatorname{comp}_{\\mathbf{b}} \\mathbf{a} = \\frac{\\mathbf{a} \\cdot \\mathbf{b}}{|\\mathbf{b}|}$, "
        r"and the vector projection is "
        r"$\\operatorname{proj}_{\\mathbf{b}} \\mathbf{a} = \\frac{\\mathbf{a} \\cdot \\mathbf{b}}{|\\mathbf{b}|^2} \\mathbf{b}$.",
        [
            r"\\operatorname{proj}_{\\mathbf{b}} \\mathbf{a}",
            rf"\\frac{{{to_latex(dot)}}}{{{factor_latex(length_b)}^{{2}}}} {vector_latex(b)}",
            vector_latex(vector),
        ],
    )
    return scalar, vector, step


def analyze_vectors(a, b):
    dot = sympy.simplify(a.dot(b))
    angle, angle_step = angle_result(a, b, dot)
    projection = projection_results(a, b, dot)
    results = [
        {"label": "Length of a", "latex": rf"|\\mathbf{{a}}| = {to_latex(length(a))}"},
        {"label": "Length of b", "latex": rf"|\\mathbf{{b}}| = {to_latex(length(b))}"},
        {"label": "Dot product", "latex": rf"\\mathbf{{a}} \\cdot \\mathbf{{b}} = {to_latex(dot)}"},
    ]
    if angle is not None:
        results.append(
            {"label": "Angle", "latex": rf"\\theta = {to_latex(angle)} \\approx {degrees(angle)}^\\circ"}
        )
    steps = [length_step(a, "a"), length_step(b, "b"), dot_product_step(a, b), angle_step]
    projection_vector = None
    if projection is not None:
        scalar, projection_vector, projection_step = projection
        results.append(
            {
                "label": "Scalar projection",
                "latex": rf"\\operatorname{{comp}}_{{\\mathbf{{b}}}} \\mathbf{{a}} = {to_latex(scalar)}",
            }
        )
        results.append(
            {
                "label": "Vector projection",
                "latex": rf"\\operatorname{{proj}}_{{\\mathbf{{b}}}} \\mathbf{{a}} = {vector_latex(projection_vector)}",
            }
        )
        steps.append(projection_step)
    return {
        "ok": True,
        "operation": "vectors",
        "aLatex": rf"\\mathbf{{a}} = {vector_latex(a)}",
        "bLatex": rf"\\mathbf{{b}} = {vector_latex(b)}",
        "results": results,
        "steps": steps,
        "arrows": {
            "a": [float(component) for component in a],
            "b": [float(component) for component in b],
            "projection": None if projection_vector is None else [float(c) for c in projection_vector],
        },
    }
`}),t=`/home/pyodide/python`;function n(n){for(let[r,i]of Object.entries(e)){let e=`${t}/${r.replace(`./python/`,``)}`;n.FS.mkdirTree(e.slice(0,e.lastIndexOf(`/`))),n.FS.writeFile(e,i)}return n.pyimport(`sys`).path.insert(0,t),n.pyimport(`mathlab.calculus`).run_request}const r=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`;function i(e){self.postMessage(e)}async function a(){i({type:`progress`,message:`Downloading Python…`});let{loadPyodide:e}=await import(
/* @vite-ignore */
`${r}pyodide.mjs`),t=await e({indexURL:r});return i({type:`progress`,message:`Loading SymPy…`}),await t.loadPackage(`sympy`),n(t)}const o=a();o.then(()=>i({type:`ready`}),e=>i({type:`loadFailed`,error:String(e)})),self.onmessage=async e=>{let{id:t,...n}=e.data,r;try{let e=await o,a=e=>i({type:`solveProgress`,id:t,message:e});r=JSON.parse(e(JSON.stringify({...n,format:`latex`}),a))}catch(e){r={ok:!1,error:`The math engine failed: ${String(e)}`}}i({type:`response`,id:t,response:r})};